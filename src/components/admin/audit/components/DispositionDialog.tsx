import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUpsertDisposition } from "../hooks/useAuditData";
import type { ScannerFinding } from "../types";

const in30Days = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

/** Snooze or accept a finding; a reason is always required. */
export const DispositionDialog = ({
  finding, mode, onClose,
}: { finding: ScannerFinding | null; mode: "accepted" | "snoozed"; onClose: () => void }) => {
  const { t } = useTranslation();
  const dispose = useUpsertDisposition();
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState(in30Days());

  useEffect(() => {
    if (finding) { setReason(""); setUntil(in30Days()); }
  }, [finding]);

  const save = async () => {
    if (!finding || !reason.trim()) return;
    await dispose.mutateAsync({
      finding_code: finding.code,
      entity_type: finding.entityType,
      entity_id: finding.entityId,
      disposition: mode,
      reason: reason.trim(),
      snooze_until: mode === "snoozed" ? new Date(`${until}T23:59:59`).toISOString() : null,
    });
    onClose();
  };

  return (
    <Dialog open={!!finding} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t(mode === "snoozed" ? "audit.action.snoozeTitle" : "audit.action.acceptTitle")}</DialogTitle>
          <DialogDescription>
            {finding ? String(t(finding.titleKey, (finding.titleParams ?? {}) as never)) : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t(mode === "snoozed" ? "audit.action.snoozeExplain" : "audit.action.acceptExplain")}
          </p>
          {mode === "snoozed" && (
            <div className="space-y-1">
              <Label htmlFor="snooze-until">{t("audit.action.snoozeUntil")}</Label>
              <Input id="snooze-until" type="date" value={until} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setUntil(e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="disp-reason">{t("audit.action.reason")} *</Label>
            <Textarea id="disp-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("audit.action.reasonPlaceholder")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={!reason.trim() || dispose.isPending || (mode === "snoozed" && !until)}>
            {dispose.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("audit.action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
