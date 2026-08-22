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
  const { companyId: authCompanyId } = useAuth();
  const effectiveCompanyId = companyId || authCompanyId;

  const [drones, setDrones] = useState<Array<{ id: string; label: string }>>([]);
  const [pilots, setPilots] = useState<Array<{ id: string; label: string }>>([]);
  const [droneId, setDroneId] = useState<string>(currentDroneId || "");
  const [pilotId, setPilotId] = useState<string>(currentPilotId || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDroneId(currentDroneId || "");
    setPilotId(currentPilotId || "");
    if (!effectiveCompanyId) return;
    (async () => {
      const [{ data: droneRows }, { data: profileRows }] = await Promise.all([
        (supabase as any).from("drones").select("id, navn, modell").eq("company_id", effectiveCompanyId).order("navn"),
        (supabase as any).from("profiles").select("id, full_name").eq("company_id", effectiveCompanyId).order("full_name"),
      ]);
      setDrones(
        (droneRows || []).map((d: any) => ({
          id: d.id,
          label: [d.navn, d.modell].filter(Boolean).join(" – ") || d.id,
        }))
      );
      setPilots((profileRows || []).map((p: any) => ({ id: p.id, label: p.full_name || p.id })));
    })();
  }, [open, effectiveCompanyId, currentDroneId, currentPilotId]);

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
            <Select value={droneId} onValueChange={setDroneId}>
              <SelectTrigger>
                <SelectValue placeholder={t("dashboard.flightAnalysis.logDetails.loggedOnNone")} />
              </SelectTrigger>
              <SelectContent className="z-[100]">
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
            <Select value={pilotId} onValueChange={setPilotId}>
              <SelectTrigger>
                <SelectValue placeholder={t("dashboard.flightAnalysis.logDetails.loggedOnNone")} />
              </SelectTrigger>
              <SelectContent className="z-[100]">
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
