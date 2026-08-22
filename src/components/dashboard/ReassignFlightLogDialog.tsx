import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { reassignFlightLog } from "@/lib/flightLogReassign";
import { droneDisplayLabel } from "@/lib/flightAnalysisTrack";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flightLogId: string;
  companyId?: string | null;
  currentDroneId?: string | null;
  currentPilotId?: string | null;
  onReassigned?: () => void;
}

export const ReassignFlightLogDialog = ({
  open,
  onOpenChange,
  flightLogId,
  companyId,
  currentDroneId,
  currentPilotId,
  onReassigned,
}: Props) => {
  const { t } = useTranslation();
  const { companyId: authCompanyId, user } = useAuth();
  const effectiveCompanyId = companyId || authCompanyId;

  const [drones, setDrones] = useState<Array<{ id: string; label: string }>>([]);
  const [pilots, setPilots] = useState<Array<{ id: string; label: string }>>([]);
  const [droneId, setDroneId] = useState<string>(currentDroneId || "");
  const [pilotId, setPilotId] = useState<string>(currentPilotId || "");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDroneId(currentDroneId || "");
    setPilotId(currentPilotId || "");
    if (!effectiveCompanyId && !user?.id) return;
    (async () => {
      setLoading(true);
      try {
        let companyIds: string[] = effectiveCompanyId ? [effectiveCompanyId] : [];
        if (user?.id) {
          const { data: visible } = await (supabase as any).rpc("get_user_visible_company_ids", { _user_id: user.id });
          const ids = (visible || []).map((v: any) => (typeof v === "string" ? v : v?.company_id)).filter(Boolean);
          if (ids.length) companyIds = Array.from(new Set([...companyIds, ...ids]));
        }
        if (!companyIds.length) {
          setDrones([]);
          setPilots([]);
          return;
        }

        const [droneRes, profileRes, companyRes] = await Promise.all([
          (supabase as any)
            .from("drones")
            .select("id, modell, serienummer, internal_serial, registration_number, company_id, aktiv")
            .in("company_id", companyIds)
            .order("modell"),
          (supabase as any)
            .from("profiles")
            .select("id, full_name, company_id")
            .in("company_id", companyIds)
            .order("full_name"),
          companyIds.length > 1
            ? (supabase as any).from("companies").select("id, navn").in("id", companyIds)
            : Promise.resolve({ data: [] }),
        ]);

        if (droneRes.error) throw droneRes.error;
        if (profileRes.error) throw profileRes.error;

        const companyNames = new Map<string, string>(
          (companyRes.data || []).map((c: any) => [c.id, c.navn])
        );
        const suffix = (cid: string | null) =>
          companyIds.length > 1 && cid && companyNames.get(cid) ? ` · ${companyNames.get(cid)}` : "";

        setDrones(
          (droneRes.data || [])
            .filter((d: any) => d.aktiv !== false || d.id === currentDroneId)
            .map((d: any) => ({
              id: d.id,
              label: (droneDisplayLabel(d) || d.id) + suffix(d.company_id),
            }))
        );
        setPilots(
          (profileRes.data || []).map((p: any) => ({
            id: p.id,
            label: (p.full_name || p.id) + suffix(p.company_id),
          }))
        );
      } catch (e: any) {
        toast.error(t("dashboard.flightAnalysis.logDetails.reassignLoadError"), { description: e?.message });
        setDrones([]);
        setPilots([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, effectiveCompanyId, currentDroneId, currentPilotId, user?.id, t]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await reassignFlightLog({
        flightLogId,
        newDroneId: droneId || null,
        newPilotId: pilotId || null,
      });
      toast.success(t("dashboard.flightAnalysis.logDetails.reassignSuccess"));
      onReassigned?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(t("dashboard.flightAnalysis.logDetails.reassignError"), { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dashboard.flightAnalysis.logDetails.reassignTitle")}</DialogTitle>
          <DialogDescription>{t("dashboard.flightAnalysis.logDetails.reassignDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("dashboard.flightAnalysis.logDetails.reassignDrone")}</Label>
            <Select value={droneId} onValueChange={setDroneId} disabled={loading || drones.length === 0}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loading
                      ? t("dashboard.flightAnalysis.logDetails.reassignLoading")
                      : drones.length === 0
                      ? t("dashboard.flightAnalysis.logDetails.reassignNoDrones")
                      : t("dashboard.flightAnalysis.logDetails.loggedOnNone")
                  }
                />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[1400]">
                {drones.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("dashboard.flightAnalysis.logDetails.reassignPilot")}</Label>
            <Select value={pilotId} onValueChange={setPilotId} disabled={loading || pilots.length === 0}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loading
                      ? t("dashboard.flightAnalysis.logDetails.reassignLoading")
                      : pilots.length === 0
                      ? t("dashboard.flightAnalysis.logDetails.reassignNoPilots")
                      : t("dashboard.flightAnalysis.logDetails.loggedOnNone")
                  }
                />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[1400]">
                {pilots.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>


          <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>{t("dashboard.flightAnalysis.logDetails.reassignWarning")}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("dashboard.flightAnalysis.logDetails.reassignCancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || (droneId === (currentDroneId || "") && pilotId === (currentPilotId || ""))}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("dashboard.flightAnalysis.logDetails.reassignSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
