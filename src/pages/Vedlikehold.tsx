import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, CalendarClock, ClipboardCheck, Gauge, Plane, RotateCcw, Search, Wrench } from "lucide-react";

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
import { DroneDetailDialog } from "@/components/resources/DroneDetailDialog";
import { EquipmentDetailDialog } from "@/components/resources/EquipmentDetailDialog";
import { ChecklistExecutionDialog } from "@/components/resources/ChecklistExecutionDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useChecklists } from "@/hooks/useChecklists";

import { cn } from "@/lib/utils";
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
  companyId?: string | null;
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
  checklistId?: string | null;
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
  const [companyFilter, setCompanyFilter] = useState<string>("alle");
  const [droneItems, setDroneItems] = useState<MaintenanceItem[]>([]);
  const [equipmentItems, setEquipmentItems] = useState<MaintenanceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState("");
  const [logbook, setLogbook] = useState<{ item: MaintenanceItem; kind: TabKey } | null>(null);
  const [detail, setDetail] = useState<{ item: MaintenanceItem; kind: TabKey } | null>(null);
  const [pending, setPending] = useState<{ item: MaintenanceItem; kind: TabKey; action: "perform" | "reset" } | null>(null);
  const [checklistPicker, setChecklistPicker] = useState<{ item: MaintenanceItem; kind: TabKey } | null>(null);
  const [checklistSearch, setChecklistSearch] = useState("");
  const [checklistRun, setChecklistRun] = useState<{ item: MaintenanceItem; kind: TabKey } | null>(null);
  const { checklists } = useChecklists();

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
          companyId: d.company_id ?? null,
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
          serial: d.serienummer || d.internal_serial || null,
          lastFlight: lastFlightByDrone.get(d.id) ?? null,
          checklistId: d.sjekkliste_id ?? null,
          totalHours: d.flyvetimer ?? 0,
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
          companyId: e.company_id ?? null,
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
          serial: e.serienummer || null,
          lastFlight: lastFlightByEquipment.get(e.id) ?? null,
          checklistId: e.sjekkliste_id ?? null,
          totalHours: e.flyvetimer ?? 0,
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
        if (companyFilter !== "alle" && i.companyId !== companyFilter) return false;
        if (!s) return true;
        return (
          i.name?.toLowerCase().includes(s) ||
          (i.subtitle || "").toLowerCase().includes(s) ||
          (i.companyName || "").toLowerCase().includes(s)
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
  }, [items, search, statusFilter, companyFilter]);

  const companyOptions = useMemo(() => {
    const map = new Map<string, string>();
    [...droneItems, ...equipmentItems].forEach((i) => {
      if (i.companyId && i.companyName) map.set(i.companyId, i.companyName);
    });
    return Array.from(map.entries())
      .map(([id, navn]) => ({ id, navn }))
      .sort((a, b) => a.navn.localeCompare(b.navn));
  }, [droneItems, equipmentItems]);

  const openDetail = (item: MaintenanceItem) => {
    setDetail({ item, kind: tab });
  };

  const applyMaintenance = async (item: MaintenanceItem, kind: TabKey, action: "perform" | "reset", noteText: string) => {
    if (!user) return;
    {
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

  const accentClasses: Record<Status, string> = {
    "Grønn": "bg-gradient-to-b from-emerald-400 to-emerald-600",
    "Gul": "bg-gradient-to-b from-amber-400 to-orange-600",
    "Rød": "bg-gradient-to-b from-red-500 to-rose-700",
  };

  const ringClasses: Record<Status, string> = {
    "Grønn": "border-emerald-500/30 hover:border-emerald-500/60",
    "Gul": "border-orange-500/40 hover:border-orange-500/70",
    "Rød": "border-red-500/50 hover:border-red-500/80",
  };

  const checklistName = (id?: string | null) =>
    id ? (checklists.find((c) => c.id === id)?.tittel ?? null) : null;

  const startPerform = (item: MaintenanceItem) => {
    setNote("");
    if (item.checklistId) {
      setChecklistRun({ item, kind: tab });
      return;
    }
    setPending({ item, kind: tab, action: "perform" });
  };

  const assignChecklist = async (checklistId: string | null) => {
    if (!checklistPicker) return;
    const { item, kind } = checklistPicker;
    try {
      const table = kind === "droner" ? "drones" : "equipment";
      const { error } = await (supabase as any)
        .from(table)
        .update({ sjekkliste_id: checklistId })
        .eq("id", item.id);
      if (error) throw error;
      toast.success(t("maintenance.checklistUpdated"));
      setChecklistPicker(null);
      await fetchAll();
    } catch (err: any) {
      console.error("Failed to set checklist:", err);
      toast.error(err.message || t("maintenance.actionError"));
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
        className={cn("group relative overflow-hidden rounded-2xl border-2 bg-card/50 backdrop-blur-md transition-all duration-300 hover:bg-card/70 hover:shadow-xl", ringClasses[item.status])}
      >
        <div className={cn("absolute left-0 top-0 h-full w-1.5 opacity-90 transition-opacity group-hover:opacity-100", accentClasses[item.status])} />

        <div className="flex flex-col lg:flex-row">
          {/* Identitet + handlinger */}
          <div className="flex-1 min-w-0 p-4 sm:p-5 pl-5 sm:pl-6 border-b lg:border-b-0 lg:border-r border-border/50">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {item.serial && (
                  <span className="inline-block mb-2 px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider">
                    {t("maintenance.serial")}: {item.serial}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => openDetail(item)}
                  className="block text-left text-lg sm:text-xl font-bold leading-tight truncate hover:underline"
                >
                  <span className="align-middle">{item.name}</span>
                  {item.companyName && (
                    <span className="ml-2 align-middle inline-block px-2 py-0.5 rounded-full border border-border/70 bg-muted/60 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {item.companyName}
                    </span>
                  )}
                </button>
                <p className="text-sm text-muted-foreground truncate">
                  {item.subtitle}
                </p>
                <p className="mt-1 text-xs flex items-center gap-1.5 truncate">
                  <ClipboardCheck className={cn("w-3.5 h-3.5 shrink-0", item.checklistId ? "text-emerald-500" : "text-muted-foreground/60")} />
                  <span className={item.checklistId ? "text-emerald-500 font-medium truncate" : "text-muted-foreground/70 truncate"}>
                    {checklistName(item.checklistId) ?? t("maintenance.noChecklist")}
                  </span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <StatusBadge status={item.status} className="justify-end mb-2" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 flex items-center justify-end gap-1">
                  <CalendarClock className="w-3 h-3" />
                  {t("maintenance.lastFlown")}
                </p>
                <p className="text-xs font-semibold">
                  {item.lastFlight ? new Date(item.lastFlight).toLocaleDateString() : t("maintenance.never")}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button size="sm" className="gap-1.5" onClick={() => startPerform(item)}>
                <Wrench className="w-4 h-4" />
                {t("maintenance.perform")}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setChecklistSearch(""); setChecklistPicker({ item, kind: tab }); }}>
                <ClipboardCheck className="w-4 h-4" />
                {t("maintenance.maintenanceChecklist")}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setLogbook({ item, kind: tab })}>
                <BookOpen className="w-4 h-4" />
                {t("maintenance.openLogbook")}
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => { setNote(""); setPending({ item, kind: tab, action: "reset" }); }}>
                <RotateCcw className="w-4 h-4" />
                {t("maintenance.reset")}
              </Button>
            </div>
          </div>

          {/* Kompakte statusbarer */}
          <div className="w-full lg:w-80 shrink-0 p-4 sm:p-5 flex flex-col justify-center gap-4 bg-muted/20">
            <MaintenanceBar
              label={t("maintenance.hours")}
              current={item.hoursUsed}
              limit={item.hoursLimit}
              status={hoursStatus}
              fractionDigits={1}
              warningAt={
                item.hoursLimit
                  ? (item.hoursWarning && item.hoursWarning > 0
                      ? (item.hoursLimit - item.hoursWarning) / item.hoursLimit
                      : 0.8)
                  : null
              }
            />
            <MaintenanceBar
              label={t("maintenance.missions")}
              current={item.missionsUsed}
              limit={item.missionsLimit}
              status={missionsStatus}
              warningAt={
                item.missionsLimit
                  ? (item.missionsWarning && item.missionsWarning > 0
                      ? (item.missionsLimit - item.missionsWarning) / item.missionsLimit
                      : 0.8)
                  : null
              }
            />
            <MaintenanceBar
              label={t("maintenance.days")}
              current={left === null ? 0 : Math.max(0, item.warningDays * 2 - left)}
              limit={item.nextDate ? Math.max(1, item.warningDays * 2) : null}
              status={dateStatus}
              warningAt={item.nextDate ? 0.5 : null}
              valueText={
                item.nextDate
                  ? t("maintenance.daysLeft", { count: left ?? 0, date: new Date(item.nextDate).toLocaleDateString() })
                  : undefined
              }
            />
          </div>
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
                {companyOptions.length > 1 && (
                  <Select value={companyFilter} onValueChange={setCompanyFilter}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alle">{t("maintenance.allDepartments", { defaultValue: "Alle avdelinger" })}</SelectItem>
                      {companyOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.navn}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
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

      {detail && detail.kind === "droner" && (
        <DroneDetailDialog
          open
          onOpenChange={(o) => { if (!o) setDetail(null); }}
          drone={detail.item.raw}
          onDroneUpdated={() => { fetchAll(); }}
        />
      )}
      {detail && detail.kind === "utstyr" && (
        <EquipmentDetailDialog
          open
          onOpenChange={(o) => { if (!o) setDetail(null); }}
          equipment={detail.item.raw}
          onEquipmentUpdated={() => { fetchAll(); }}
        />
      )}

      {logbook && logbook.kind === "droner" && (
        <DroneLogbookDialog
          open
          onOpenChange={(o) => { if (!o) setLogbook(null); }}
          droneId={logbook.item.id}
          droneModell={logbook.item.name}
          flyvetimer={logbook.item.totalHours}
        />
      )}
      {logbook && logbook.kind === "utstyr" && (
        <EquipmentLogbookDialog
          open
          onOpenChange={(o) => { if (!o) setLogbook(null); }}
          equipmentId={logbook.item.id}
          equipmentNavn={logbook.item.name}
          flyvetimer={logbook.item.totalHours}
          equipmentType={logbook.item.raw?.type}
          equipmentSerienummer={logbook.item.serial ?? undefined}
        />
      )}

      {checklistRun && (
        <ChecklistExecutionDialog
          open
          onOpenChange={(o) => { if (!o) setChecklistRun(null); }}
          checklistId={checklistRun.item.checklistId || undefined}
          itemName={checklistRun.item.name}
          onComplete={() => {
            const target = checklistRun;
            setChecklistRun(null);
            if (target) setPending({ item: target.item, kind: target.kind, action: "perform" });
          }}
        />
      )}

      <Dialog open={!!checklistPicker} onOpenChange={(o) => { if (!o) setChecklistPicker(null); }}>
        <DialogContent className="max-w-lg max-h-[85dvh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-primary" />
              {t("maintenance.maintenanceChecklist")}
            </DialogTitle>
            <DialogDescription>
              {t("maintenance.checklistPickerDescription", { name: checklistPicker?.item.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t("maintenance.checklistSearchPlaceholder")}
              value={checklistSearch}
              onChange={(e) => setChecklistSearch(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {checklists
              .filter((c) => c.tittel.toLowerCase().includes(checklistSearch.trim().toLowerCase()))
              .map((c) => {
                const active = checklistPicker?.item.checklistId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => assignChecklist(c.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors hover:bg-muted/50",
                      active && "bg-emerald-500/10 text-emerald-500 font-medium",
                    )}
                  >
                    {c.tittel}
                  </button>
                );
              })}
            {checklists.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">{t("maintenance.noChecklistsAvailable")}</p>
            )}
          </div>
          {checklistPicker?.item.checklistId && (
            <Button variant="ghost" size="sm" onClick={() => assignChecklist(null)}>
              {t("maintenance.removeChecklist")}
            </Button>
          )}
        </DialogContent>
      </Dialog>

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
