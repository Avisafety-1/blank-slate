import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileQuestion, Loader2, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { UploadDroneLogDialog } from "@/components/UploadDroneLogDialog";
import {
  COMPLETED_STATUS, MISSING_LOG_CODE, missingLogFindingKey, splitFindingKeys,
} from "@/components/admin/audit/lib/operationsAnalysis";

interface Reminder {
  id: string;
  sender_id: string | null;
  recipient_id: string;
  company_id: string;
  subject: string;
  finding_key: string | null;
  thread_root_id: string | null;
}

interface Props {
  missionId: string;
  messageId: string | null;
  onDone: () => void;
}

/** Shown at the top of the mission dialog when opened from a missing-flight-log reminder. */
export const NoFlightPromptCard = ({ missionId, messageId, onDone }: Props) => {
  const { t, i18n } = useTranslation();
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [mission, setMission] = useState<{ tittel: string | null; tidspunkt: string | null } | null>(null);
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [senderName, setSenderName] = useState<string>("—");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const [{ data: m }, { count }, { data: personnel }] = await Promise.all([
        supabase.from("missions").select("id, tittel, tidspunkt, status, user_id").eq("id", missionId).maybeSingle(),
        supabase.from("flight_logs").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("mission_personnel").select("profile_id").eq("mission_id", missionId),
      ]);
      if (cancelled || !m) return;
      const allowed = isAdmin || m.user_id === user.id || (personnel ?? []).some((p) => p.profile_id === user.id);
      if (!allowed || m.status !== COMPLETED_STATUS || (count ?? 0) > 0) return;

      let rem: Reminder | null = null;
      if (messageId) {
        const { data } = await supabase.from("internal_messages")
          .select("id, sender_id, recipient_id, company_id, subject, finding_key, thread_root_id")
          .eq("id", messageId).maybeSingle();
        rem = (data as Reminder | null) ?? null;
      }
      if (!rem) {
        // Opened from inbox/email without msg id: latest reminder for this mission to me.
        const { data } = await supabase.from("internal_messages")
          .select("id, sender_id, recipient_id, company_id, subject, finding_key, thread_root_id")
          .eq("recipient_id", user.id)
          .ilike("finding_key", `%${missingLogFindingKey(missionId)}%`)
          .order("created_at", { ascending: false }).limit(1);
        rem = (data?.[0] as Reminder | undefined) ?? null;
      }
      if (rem?.sender_id) {
        const { data: p } = await supabase.from("profiles").select("full_name").eq("id", rem.sender_id).maybeSingle();
        if (!cancelled) setSenderName(p?.full_name ?? "—");
      }
      if (cancelled) return;
      setMission({ tittel: m.tittel, tidspunkt: m.tidspunkt });
      setReminder(rem);
      setVisible(true);
    })();
    return () => { cancelled = true; };
  }, [missionId, messageId, user?.id, isAdmin]);

  /** Bulk reminders list several missions; mark done only when none of the others still lack a log. */
  const othersStillOpen = async (key: string | null): Promise<boolean> => {
    const others = splitFindingKeys(key)
      .filter((k) => k.startsWith(`${MISSING_LOG_CODE}:mission:`))
      .map((k) => k.split(":")[2])
      .filter((id) => id && id !== missionId);
    if (!others.length) return false;
    const [{ data: ms }, { data: logs }] = await Promise.all([
      supabase.from("missions").select("id, status").in("id", others),
      supabase.from("flight_logs").select("mission_id").in("mission_id", others),
    ]);
    const withLog = new Set((logs ?? []).map((l) => l.mission_id));
    return (ms ?? []).some((m) => m.status === COMPLETED_STATUS && !withLog.has(m.id));
  };

  const confirm = async () => {
    if (!user?.id || !mission) return;
    setSaving(true);
    try {
      const { error: upErr } = await supabase.from("missions").update({ status: "Avbrutt" }).eq("id", missionId);
      if (upErr) throw upErr;

      const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      const pilot = me?.full_name ?? user.email ?? "—";
      const title = mission.tittel ?? "—";

      if (reminder?.sender_id && reminder.sender_id !== user.id) {
        const body = [
          t("missions.noFlight.replyBody", { pilot, title }),
          comment.trim() ? `\n${t("missions.noFlight.commentLabel")}: ${comment.trim()}` : "",
        ].join("");
        const { error: msgErr } = await supabase.from("internal_messages").insert({
          company_id: reminder.company_id,
          sender_id: user.id,
          recipient_id: reminder.sender_id,
          subject: `Re: ${reminder.subject}`,
          body,
          deep_link: `/oppdrag?id=${missionId}`,
          parent_id: reminder.id,
          thread_root_id: reminder.thread_root_id ?? reminder.id,
          severity: "info",
        });
        if (msgErr) console.warn("[NoFlightPromptCard] reply failed", msgErr);
      }

      if (reminder && reminder.recipient_id === user.id && !(await othersStillOpen(reminder.finding_key))) {
        await supabase.from("internal_messages")
          .update({ status: "done", done_at: new Date().toISOString() })
          .eq("id", reminder.id);
      }

      toast.success(t("missions.noFlight.toast", { name: senderName }));
      qc.invalidateQueries({ queryKey: ["audit"] });
      qc.invalidateQueries({ queryKey: ["inbox"] });
      setConfirmOpen(false);
      setVisible(false);
      onDone();
    } catch (e) {
      toast.error(t("missions.noFlight.failed"), { description: String((e as Error).message ?? e) });
    } finally {
      setSaving(false);
    }
  };

  if (!visible || !mission) return null;
  const title = mission.tittel ?? "—";

  return (
    <>
      <div className="mx-4 sm:mx-6 mb-2 rounded-lg border border-status-yellow/50 bg-status-yellow/10 p-3 space-y-2">
        <div className="flex items-start gap-2 text-sm font-medium">
          <FileQuestion className="w-4 h-4 mt-0.5 shrink-0 text-status-yellow" />
          <span>{t("missions.noFlight.prompt")}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="w-3.5 h-3.5 mr-1.5" /> {t("missions.noFlight.upload")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmOpen(true)}>
            <XCircle className="w-3.5 h-3.5 mr-1.5" /> {t("missions.noFlight.notFlown")}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !saving && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("missions.noFlight.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {reminder?.sender_id
                ? t("missions.noFlight.confirmBody", { title, name: senderName })
                : t("missions.noFlight.confirmBodyNoReminder", { title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("missions.noFlight.commentPlaceholder")}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirm(); }} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("missions.noFlight.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UploadDroneLogDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </>
  );
};
