import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, CalendarClock, Gauge, Plane, RotateCcw, Search, Wrench } from "lucide-react";

import droneBackground from "@/assets/drone-background.png";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { MaintenanceBar } from "@/components/maintenance/MaintenanceBar";
import { DroneLogbookDialog } from "@/components/resources/DroneLogbookDialog";
import { EquipmentLogbookDialog } from "@/components/resources/EquipmentLogbookDialog";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTerminology } from "@/hooks/useTerminology";
import { Status } from "@/types";
import {
  calculateMaintenanceStatus,
  calculateUsageStatus,
  worstStatus,
  STATUS_PRIORITY,
} from "@/lib/maintenanceStatus";
import { performDroneInspection, countUniqueMissionsSinceInspection } from "@/lib/droneInspection";

type TabKey = "droner" | "utstyr";

interface MaintenanceItem {
  id: string;
  name: string;
  subtitle?: string | null;
  companyName?: string | null;
  isForeignCompany: boolean;
  hoursUsed: number;
  hoursLimit: number | null;
  hoursWarning: number | null;
  missionsUsed: number;
  missionsLimit: number | null;
  missionsWarning: number | null;
  nextDate: string | null;
  warningDays: number;
  status: Status;
  serial?: string | null;
  lastFlight?: string | null;
  totalHours: number;
  raw: any;
}

const daysUntil = (date: string | null): number | null => {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return Math.floor((next.getTime() - today.getTime()) / 86400000);
};

const Vedlikehold = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const terminology = useTerminology();
  const { user, loading, companyId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = (searchParams.get("tab") === "utstyr" ? "utstyr" : "droner") as TabKey;
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [droneItems, setDroneItems] = useState<MaintenanceItem[]>([]);
  const [equipmentItems, setEquipmentItems] = useState<MaintenanceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<{ item: MaintenanceItem; kind: TabKey; action: "perform" | "reset" } | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [user, loading, navigate]);

  const changeTab = (value: string) => {
    const next = (value === "utstyr" ? "utstyr" : "droner") as TabKey;
    setTab(next);
    setSearchParams({ tab: next }, { replace: true });
  };

  const fetchAll = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [droneRes, equipmentRes] = await Promise.all([
        (supabase as any)
          .from("drones")
          .select("*, companies(navn)")
          .eq("aktiv", true)
          .order("modell", { ascending: true }),
        (supabase as any)
          .from("equipment")
          .select("*, companies(navn)")
          .eq("aktiv", true)
          .order("navn", { ascending: true }),
      ]);

      if (droneRes.error) throw droneRes.error;
      if (equipmentRes.error) throw equipmentRes.error;

      const droneIds = (droneRes.data || []).map((d: any) => d.id);
      const equipmentIds = (equipmentRes.data || []).map((e: any) => e.id);
      const lastFlightByDrone = new Map<string, string>();
      const lastFlightByEquipment = new Map<string, string>();

      if (droneIds.length > 0) {
        const { data } = await (supabase as any)
          .from("flight_logs")
          .select("drone_id, flight_date")
          .in("drone_id", droneIds)
          .order("flight_date", { ascending: false });
        (data || []).forEach((r: any) => {
          if (r.drone_id && !lastFlightByDrone.has(r.drone_id)) lastFlightByDrone.set(r.drone_id, r.flight_date);
        });
      }

      if (equipmentIds.length > 0) {
        const { data } = await (supabase as any)
          .from("flight_log_equipment")
          .select("equipment_id, flight_logs(flight_date)")
          .in("equipment_id", equipmentIds);
        (data || []).forEach((r: any) => {
          const date = r.flight_logs?.flight_date;
          if (!date || !r.equipment_id) return;
          const current = lastFlightByEquipment.get(r.equipment_id);
          if (!current || date > current) lastFlightByEquipment.set(r.equipment_id, date);
        });
      }


      const drones = await Promise.all((droneRes.data || []).map(async (d: any) => {
        let missionsUsed = 0;
        if (d.inspection_interval_missions) {
          missionsUsed = await countUniqueMissionsSinceInspection(d.id, d.sist_inspeksjon);
        }
        const hoursUsed = Math.max(0, (d.flyvetimer ?? 0) - (d.hours_at_last_inspection ?? 0));
        const dateStatus = calculateMaintenanceStatus(d.neste_inspeksjon, d.varsel_dager ?? 14);
        const hoursStatus = calculateUsageStatus(hoursUsed, d.inspection_interval_hours, d.varsel_timer);
        const missionsStatus = calculateUsageStatus(missionsUsed, d.inspection_interval_missions, d.varsel_oppdrag);
        const item: MaintenanceItem = {
          id: d.id,
          name: d.modell,
          subtitle: d.dji_aircraft_name || d.registration_number || d.serienummer || null,
          companyName: d.companies?.navn ?? null,
          isForeignCompany: !!companyId && d.company_id !== companyId,
          hoursUsed,
          hoursLimit: d.inspection_interval_hours ?? null,
          hoursWarning: d.varsel_timer ?? null,
          missionsUsed,
          missionsLimit: d.inspection_interval_missions ?? null,
          missionsWarning: d.varsel_oppdrag ?? null,
          nextDate: d.neste_inspeksjon ?? null,
          warningDays: d.varsel_dager ?? 14,
          status: [dateStatus, hoursStatus, missionsStatus].reduce((w, s) => worstStatus(w, s), "Grønn" as Status),
          raw: d,
        };
        return item;
      }));

      const equipment = await Promise.all((equipmentRes.data || []).map(async (e: any) => {
        let missionsUsed = 0;
        if (e.inspection_interval_missions) {
          const { data } = await supabase
            .from("mission_equipment")
            .select("mission_id")
            .eq("equipment_id", e.id);
          const total = new Set((data || []).map((r: any) => r.mission_id)).size;
          missionsUsed = Math.max(0, total - (e.missions_at_last_maintenance ?? 0));
        }
        const hoursUsed = Math.max(0, (e.flyvetimer ?? 0) - (e.hours_at_last_maintenance ?? 0));
        const dateStatus = calculateMaintenanceStatus(e.neste_vedlikehold, e.varsel_dager ?? 14);
        const hoursStatus = calculateUsageStatus(hoursUsed, e.inspection_interval_hours, e.varsel_timer);
        const missionsStatus = calculateUsageStatus(missionsUsed, e.inspection_interval_missions, e.varsel_oppdrag);
        const item: MaintenanceItem = {
          id: e.id,
          name: e.navn,
          subtitle: e.type || e.serienummer || null,
          companyName: e.companies?.navn ?? null,
          isForeignCompany: !!companyId && e.company_id !== companyId,
          hoursUsed,
          hoursLimit: e.inspection_interval_hours ?? null,
          hoursWarning: e.varsel_timer ?? null,
          missionsUsed,
          missionsLimit: e.inspection_interval_missions ?? null,
          missionsWarning: e.varsel_oppdrag ?? null,
          nextDate: e.neste_vedlikehold ?? null,
          warningDays: e.varsel_dager ?? 14,
          status: [dateStatus, hoursStatus, missionsStatus].reduce((w, s) => worstStatus(w, s), "Grønn" as Status),
          raw: e,
        };
        return item;
      }));

      setDroneItems(drones);
      setEquipmentItems(equipment);
    } catch (err: any) {
      console.error("Error loading maintenance overview:", err);
      toast.error(t("maintenance.loadError"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, companyId]);

  const items = tab === "droner" ? droneItems : equipmentItems;

  const visibleItems = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items
      .filter((i) => {
        if (statusFilter !== "alle" && i.status !== statusFilter) return false;
        if (!s) return true;
        return (
          i.name?.toLowerCase().includes(s) ||
          (i.subtitle || "").toLowerCase().includes(s)
        );
      })
      .sort((a, b) => {
        const p = STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status];
        if (p !== 0) return p;
        const da = daysUntil(a.nextDate);
        const db = daysUntil(b.nextDate);
        if (da === null && db === null) return (a.name || "").localeCompare(b.name || "");
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      });
  }, [items, search, statusFilter]);

  const openDetail = (item: MaintenanceItem) => {
    navigate(`/ressurser?tab=${tab === "droner" ? "drones" : "equipment"}&id=${item.id}`);
  };

  const runAction = async () => {
    if (!pending || !user || submitting) return;
    const { item, kind, action } = pending;
    setSubmitting(true);
    try {
      if (kind === "droner") {
        const d = item.raw;
        if (action === "perform") {
          await performDroneInspection({
            droneId: d.id,
            companyId: d.company_id,
            userId: user.id,
            currentFlyvetimer: d.flyvetimer ?? 0,
            inspectionIntervalDays: d.inspection_interval_days ?? null,
            inspectionType: t("maintenance.performedType"),
            notes: note,
          });
        } else {
          const { count: totalMissions } = await supabase
            .from("flight_logs")
            .select("mission_id", { count: "exact", head: true })
            .eq("drone_id", d.id)
            .not("mission_id", "is", null);
          let nextInspection: string | null = null;
          if (d.inspection_interval_days) {
            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + d.inspection_interval_days);
            nextInspection = nextDate.toISOString().split("T")[0];
          }
          const { error } = await supabase
            .from("drones")
            .update({
              neste_inspeksjon: nextInspection,
              hours_at_last_inspection: d.flyvetimer ?? 0,
              missions_at_last_inspection: totalMissions ?? 0,
            })
            .eq("id", d.id);
          if (error) throw error;
        }
      } else {
        const e = item.raw;
        const today = new Date().toISOString().split("T")[0];
        let nextMaintenance: string | null = null;
        if (e.vedlikeholdsintervall_dager) {
          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + e.vedlikeholdsintervall_dager);
          nextMaintenance = nextDate.toISOString().split("T")[0];
        }
        const { data: meData } = await supabase
          .from("mission_equipment")
          .select("mission_id")
          .eq("equipment_id", e.id);
        const totalMissions = new Set((meData || []).map((r: any) => r.mission_id)).size;

        const update: Record<string, any> = {
          neste_vedlikehold: nextMaintenance,
          hours_at_last_maintenance: e.flyvetimer ?? 0,
          missions_at_last_maintenance: totalMissions,
        };
        if (action === "perform") update.sist_vedlikeholdt = today;

        const { error } = await (supabase as any).from("equipment").update(update).eq("id", e.id);
        if (error) throw error;

        if (action === "perform" && companyId) {
          await supabase.from("equipment_log_entries").insert({
            equipment_id: e.id,
            company_id: e.company_id ?? companyId,
            user_id: user.id,
            entry_date: today,
            entry_type: "vedlikehold",
            title: t("maintenance.performedType"),
            description: note || t("maintenance.performedType"),
          });
        }
      }

      toast.success(
        action === "perform"
          ? t("maintenance.performedSuccess", { name: item.name })
          : t("maintenance.resetSuccess", { name: item.name })
      );
      setPending(null);
      setNote("");
      await fetchAll();
    } catch (err: any) {
      console.error("Maintenance action failed:", err);
      toast.error(err.message || t("maintenance.actionError"));
    } finally {
      setSubmitting(false);
    }
  };

  const renderRow = (item: MaintenanceItem) => {
    const dateStatus = calculateMaintenanceStatus(item.nextDate, item.warningDays);
    const hoursStatus = calculateUsageStatus(item.hoursUsed, item.hoursLimit, item.hoursWarning);
    const missionsStatus = calculateUsageStatus(item.missionsUsed, item.missionsLimit, item.missionsWarning);
    const left = daysUntil(item.nextDate);

    return (
      <div
        key={item.id}
        className="p-3 sm:p-4 rounded-lg border border-border bg-background/50 hover:bg-background/70 transition-colors"
      >
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <button type="button" className="text-left min-w-0" onClick={() => openDetail(item)}>
            <h3 className="font-semibold truncate hover:underline">{item.name}</h3>
            {item.subtitle && <p className="text-sm text-muted-foreground truncate">{item.subtitle}</p>}
            {item.isForeignCompany && item.companyName && (
              <Badge variant="secondary" className="mt-1 text-xs">{item.companyName}</Badge>
            )}
          </button>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <StatusBadge status={item.status} />
            <Button size="sm" className="gap-1" onClick={() => { setNote(""); setPending({ item, kind: tab, action: "perform" }); }}>
              <Wrench className="w-4 h-4" />
              {t("maintenance.perform")}
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => { setNote(""); setPending({ item, kind: tab, action: "reset" }); }}>
              <RotateCcw className="w-4 h-4" />
              {t("maintenance.reset")}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <MaintenanceBar
            label={t("maintenance.hours")}
            current={item.hoursUsed}
            limit={item.hoursLimit}
            status={hoursStatus}
            fractionDigits={1}
          />
          <MaintenanceBar
            label={t("maintenance.missions")}
            current={item.missionsUsed}
            limit={item.missionsLimit}
            status={missionsStatus}
          />
          <MaintenanceBar
            label={t("maintenance.days")}
            current={left === null ? 0 : Math.max(0, item.warningDays * 2 - left)}
            limit={item.nextDate ? Math.max(1, item.warningDays * 2) : null}
            status={dateStatus}
            valueText={
              item.nextDate
                ? t("maintenance.daysLeft", { count: left ?? 0, date: new Date(item.nextDate).toLocaleDateString() })
                : undefined
            }
          />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen relative w-full overflow-x-hidden">
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url(${droneBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
        }}
      />

      <div className="relative z-10 w-full">
        <main className="w-full px-3 sm:px-4 py-4 sm:py-6">
          <GlassCard>
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-primary" />
                <h1 className="text-lg sm:text-xl font-semibold">{t("maintenance.title")}</h1>
              </div>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate("/ressurser")}>
                <ArrowLeft className="w-4 h-4" />
                {t("resources.title", { defaultValue: "Ressurser" })}
              </Button>
            </div>

            <Tabs value={tab} onValueChange={changeTab}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="droner" className="gap-2">
                  <Plane className="w-4 h-4" />
                  {terminology.vehicles}
                </TabsTrigger>
                <TabsTrigger value="utstyr" className="gap-2">
                  <Gauge className="w-4 h-4" />
                  {t("resources.equipment")}
                </TabsTrigger>
              </TabsList>

              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("maintenance.searchPlaceholder")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">{t("maintenance.allStatuses")}</SelectItem>
                    <SelectItem value="Rød">{t("status.red", { defaultValue: "Rød" })}</SelectItem>
                    <SelectItem value="Gul">{t("status.yellow", { defaultValue: "Gul" })}</SelectItem>
                    <SelectItem value="Grønn">{t("status.green", { defaultValue: "Grønn" })}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <TabsContent value="droner" className="mt-0 space-y-3">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">{t("maintenance.loading")}</p>
                ) : visibleItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">{t("maintenance.empty")}</p>
                ) : (
                  visibleItems.map(renderRow)
                )}
              </TabsContent>
              <TabsContent value="utstyr" className="mt-0 space-y-3">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">{t("maintenance.loading")}</p>
                ) : visibleItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">{t("maintenance.empty")}</p>
                ) : (
                  visibleItems.map(renderRow)
                )}
              </TabsContent>
            </Tabs>
          </GlassCard>
        </main>
      </div>

      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) { setPending(null); setNote(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.action === "reset" ? t("maintenance.confirmResetTitle") : t("maintenance.confirmPerformTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.action === "reset"
                ? t("maintenance.confirmResetDescription", { name: pending?.item.name })
                : t("maintenance.confirmPerformDescription", { name: pending?.item.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pending?.action === "perform" && (
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("maintenance.notePlaceholder")}
              rows={3}
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); runAction(); }} disabled={submitting}>
              {pending?.action === "reset" ? t("maintenance.reset") : t("maintenance.perform")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Vedlikehold;
