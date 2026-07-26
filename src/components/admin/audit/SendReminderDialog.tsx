import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, Loader2, Mail, MessageSquare, Inbox } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { resolveRecipients, type RecipientSuggestion } from "./services/ReminderRecipientResolver";
import { useSendReminder } from "./hooks/useSendReminder";
import type { ScannerFinding } from "./types";

interface Props {
  finding: ScannerFinding | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export const SendReminderDialog = ({ finding, open, onOpenChange }: Props) => {
  const { t } = useTranslation();
  const { companyId } = useAuth();
  const send = useSendReminder();

  const [recipients, setRecipients] = useState<RecipientSuggestion[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [channels, setChannels] = useState({ email: true, sms: false, inbox: true });

  useEffect(() => {
    if (!open || !finding || !companyId) return;
    const title = String(t(finding.titleKey, (finding.titleParams ?? {}) as never) ?? "");
    const detail = finding.bodyKey ? String(t(finding.bodyKey, (finding.bodyParams ?? {}) as never) ?? "") : "";
    setSubject(t("audit.reminder.subjectPrefix") + " " + title);
    setBody(
      t("audit.reminder.bodyTemplate", { title, detail: detail || t("audit.reminder.noDetail") }) as string,
    );
    resolveRecipients(finding, companyId).then(setRecipients);
  }, [open, finding, companyId, t]);

  const removeRecipient = (id: string) =>
    setRecipients((prev) => prev.filter((r) => r.id !== id));

  const handleSend = async () => {
    if (!finding || recipients.length === 0) return;
    await send.mutateAsync({
      recipient_ids: recipients.map((r) => r.id),
      subject,
      body,
      deep_link: finding.deepLink?.path ?? null,
      finding_key: `${finding.code}:${finding.entityType}:${finding.entityId}`,
      severity: finding.severity,
      channels,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("audit.reminder.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t("audit.reminder.recipients")}</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5 min-h-[36px] p-2 border border-input rounded-md bg-background">
              {recipients.length === 0 ? (
                <span className="text-xs text-muted-foreground">{t("audit.reminder.noRecipients")}</span>
              ) : (
                recipients.map((r) => (
                  <Badge key={r.id} variant="secondary" className="gap-1">
                    {r.full_name || r.email}
                    <button onClick={() => removeRecipient(r.id)} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="subj">{t("audit.reminder.subject")}</Label>
            <Input id="subj" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div>
            <Label htmlFor="body">{t("audit.reminder.body")}</Label>
            <Textarea id="body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>

          <div>
            <Label>{t("audit.reminder.channels")}</Label>
            <div className="flex flex-col gap-2 mt-1.5">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={channels.email}
                  onCheckedChange={(v) => setChannels((c) => ({ ...c, email: !!v }))}
                />
                <Mail className="w-4 h-4" /> {t("audit.reminder.channelEmail")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={channels.sms}
                  onCheckedChange={(v) => setChannels((c) => ({ ...c, sms: !!v }))}
                />
                <MessageSquare className="w-4 h-4" /> {t("audit.reminder.channelSms")}
              </label>
              <label className="flex items-center gap-2 text-sm opacity-70">
                <Checkbox checked disabled />
                <Inbox className="w-4 h-4" /> {t("audit.reminder.channelInbox")}
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSend} disabled={send.isPending || recipients.length === 0 || !subject.trim()}>
            {send.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t("audit.reminder.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
