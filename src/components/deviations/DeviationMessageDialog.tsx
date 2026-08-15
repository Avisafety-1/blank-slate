import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Send } from "lucide-react";
import { useSendMessage } from "@/components/profile/hooks/useSendMessage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { DeviationReport } from "@/hooks/useDeviationReports";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: DeviationReport | null;
  mode: "message" | "request_incident";
  onSent: () => void;
}

export const DeviationMessageDialog = ({ open, onOpenChange, report, mode, onSent }: Props) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const sendMessage = useSendMessage();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sendEmail, setSendEmail] = useState(false);

  const categoryLabel = report?.category_path?.join(" › ") ?? "";
  const missionTitle = report?.mission?.tittel ?? "";

  useEffect(() => {
    if (!open || !report) return;
    setSendEmail(false);
    if (mode === "request_incident") {
      setSubject(t("deviations.message.requestSubject", { mission: missionTitle }));
      setBody(t("deviations.message.requestBody", { category: categoryLabel, mission: missionTitle }));
    } else {
      setSubject(t("deviations.message.defaultSubject", { mission: missionTitle }));
      setBody("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, report, mode]);

  const send = async () => {
    if (!report?.reported_by) {
      toast.error(t("deviations.message.noRecipient"));
      return;
    }
    const link = `${window.location.origin}/hendelser?tab=deviations&deviation=${report.id}`;
    await sendMessage.mutateAsync({
      recipient_ids: [report.reported_by],
      subject,
      body: `${body}\n\n${link}`,
      severity: mode === "request_incident" ? "warning" : "info",
      channels: { email: sendEmail },
    });

    if (mode === "request_incident") {
      const { error } = await (supabase as any)
        .from("mission_deviation_reports")
        .update({
          incident_requested_at: new Date().toISOString(),
          incident_requested_by: user?.id ?? null,
          status: report.status === "new" ? "in_progress" : report.status,
        })
        .eq("id", report.id);
      if (error) toast.error(error.message);
    }
    onOpenChange(false);
    onSent();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "request_incident" ? t("deviations.message.requestTitle") : t("deviations.message.title")}
          </DialogTitle>
          <DialogDescription>
            {t("deviations.message.recipient", { name: report?.reporter_name ?? "—" })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t("deviations.message.subject")}</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t("deviations.message.body")}</label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={sendEmail} onCheckedChange={(v) => setSendEmail(v === true)} />
            {t("deviations.message.alsoEmail")}
          </label>
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sendMessage.isPending}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={send} disabled={sendMessage.isPending || !subject.trim()} className="gap-2">
            {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {t("deviations.message.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
