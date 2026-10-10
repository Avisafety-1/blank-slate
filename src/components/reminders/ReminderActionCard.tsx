import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { UploadDroneLogDialog } from "@/components/UploadDroneLogDialog";
import { clearActiveFlight } from "@/hooks/useFlightTimer";
import {
  INCIDENT_CLOSED_STATUSES, availableActions, missionCodeForStatus, parseFindingKeys,
  ACTION_KIND, targetMissionStatus, type ParsedFindingKey, type ReminderActionId, type ReminderEntityState,
} from "./reminderActions";
import { canOpenEntity, useAuditEntityDialog, type EntityOpenTarget } from "@/components/admin/audit/components/AuditEntityDialogHost";

interface Reminder {
  id: string;
  sender_id: string | null;
  recipient_id: string;
  company_id: string;
  subject: string;
  finding_key: string | null;
  thread_root_id: string | null;
}

interface Loaded {
  title: string;
  state: ReminderEntityState;
  allowed: boolean;
  flight?: { profile_id: string; mission_id: string | null; publish_mode: string | null };
}

type Ctx = { userId: string; isAdmin: boolean; isCaseHandler: boolean };

/** Loads the current state of the entity so actions are only offered while still relevant. */
async function loadEntity(k: ParsedFindingKey, ctx: Ctx): Promise<Loaded | null> {
  if (k.entityType === "mission") {
    const [{ data: m }, { count }, { data: personnel }, { count: riskCount }, { data: latestRisk }, { count: activeCount }] = await Promise.all([
      supabase.from("missions").select("id, tittel, status, user_id, tidspunkt").eq("id", k.entityId).maybeSingle(),
      supabase.from("flight_logs").select("id", { count: "exact", head: true }).eq("mission_id", k.entityId),
      supabase.from("mission_personnel").select("profile_id").eq("mission_id", k.entityId),
      supabase.from("mission_risk_assessments").select("id", { count: "exact", head: true }).eq("mission_id", k.entityId),
      supabase.from("mission_risk_assessments").select("ai_analysis").eq("mission_id", k.entityId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      (supabase as any).from("active_flights").select("id", { count: "exact", head: true }).eq("mission_id", k.entityId),
    ]);
    if (!m) return null;
    const allowed = ctx.isAdmin || m.user_id === ctx.userId || (personnel ?? []).some((p) => p.profile_id === ctx.userId);
    const analysis = latestRisk?.ai_analysis as any;
    const deviations = analysis?.soraProfile?.deviations ?? analysis?.sora_profile?.deviations ?? [];
    return { title: m.tittel ?? "—", allowed, state: {
      missionStatus: m.status, hasFlightLog: (count ?? 0) > 0, missionTimePassed: !!m.tidspunkt && new Date(m.tidspunkt).getTime() < Date.now(),
      activeFlightEnded: (activeCount ?? 0) === 0 && (count ?? 0) > 0, riskAssessmentMissing: (riskCount ?? 0) === 0,
      soraEnvelopeExceeded: Array.isArray(deviations) && deviations.length > 0, canWrite: allowed,
    } };
  }
  if (k.entityType === "active_flight") {
    const { data: f } = await (supabase as any).from("active_flights")
      .select("id, profile_id, mission_id, publish_mode, pilot_name").eq("id", k.entityId).maybeSingle();
    if (!f) return { title: "—", allowed: false, state: { flightActive: false } };
    let title = f.pilot_name ?? "—";
    if (f.mission_id) {
      const { data: m } = await supabase.from("missions").select("tittel").eq("id", f.mission_id).maybeSingle();
      if (m?.tittel) title = m.tittel;
    }
    const mine = f.profile_id === ctx.userId;
    return { title, allowed: mine || ctx.isAdmin, state: { flightActive: true, flightIsMine: mine }, flight: f };
  }
  if (k.entityType === "incident") {
    const { data: i } = await supabase.from("incidents")
      .select("id, tittel, status, oppfolgingsansvarlig_id").eq("id", k.entityId).maybeSingle();
    if (!i) return null;
    return {
      title: i.tittel ?? "—",
      allowed: ctx.isAdmin || ctx.isCaseHandler,
      state: { incidentResponsibleId: i.oppfolgingsansvarlig_id, incidentClosed: INCIDENT_CLOSED_STATUSES.includes(i.status ?? ""), isCurrentUserResponsible: i.oppfolgingsansvarlig_id === ctx.userId, canWrite: ctx.isAdmin || ctx.isCaseHandler },
    };
  }
  if (k.entityType === "audit_action") {
    const { data: action } = await supabase.from("audit_actions").select("id, description, status").eq("id", k.entityId).maybeSingle();
    return action ? { title: action.description ?? "—", allowed: true, state: { auditActionClosed: action.status === "closed" } } : null;
  }
  if (k.entityType === "audit_finding") return { title: "—", allowed: true, state: {} };
  if (k.entityType === "competency") {
    const { data } = await supabase.from("personnel_competencies").select("id, navn, utloper_dato, varsel_dager").eq("id", k.entityId).maybeSingle();
    if (!data) return null;
    const expiry = data.utloper_dato ? new Date(data.utloper_dato).getTime() : Number.POSITIVE_INFINITY;
    const relevant = expiry <= Date.now() + (data.varsel_dager ?? 30) * 86_400_000;
    return { title: data.navn ?? "—", allowed: true, state: { competencyRelevant: relevant } };
  }
  if (k.entityType === "document") {
    if (k.entityId === "emergency-plan") return { title: "—", allowed: true, state: { emergencyPlanMissing: true, canWrite: ctx.isAdmin } };
    const { data } = await supabase.from("documents").select("id, tittel, gyldig_til, varsel_dager_for_utløp").eq("id", k.entityId).maybeSingle();
    if (!data) return null;
    const expiry = data.gyldig_til ? new Date(data.gyldig_til).getTime() : Number.POSITIVE_INFINITY;
    return { title: data.tittel ?? "—", allowed: true, state: { documentRelevant: expiry <= Date.now() + (data.varsel_dager_for_utløp ?? 30) * 86_400_000, canWrite: ctx.isAdmin } };
  }
  if (k.entityType === "drone") {
    const { data } = await supabase.from("drones").select("id, modell, status").eq("id", k.entityId).maybeSingle();
    return data ? { title: data.modell ?? "—", allowed: true, state: { droneNeedsAttention: data.status !== "Grønn" } } : null;
  }
  return null;
}

interface Props {
  findingKey: ParsedFindingKey;
  messageId?: string | null;
  /** Action to highlight (from ?action=). */
  preselect?: ReminderActionId | null;
  /** Shows an "Open" button (inbox rows for bulk reminders). */
  openPath?: string | null;
  /** Mission page: open the edit dialog in place. Otherwise navigates to the edit link. */
  onEditMission?: (missionId: string) => void;
  onDone?: () => void;
  onAvailabilityChange?: (key: string, count: number) => void;
  className?: string;
}

export const ReminderActionCard = ({ findingKey, messageId, preselect, openPath, onEditMission, onDone, onAvailabilityChange, className }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isAdmin, userRole } = useAuth();
  const qc = useQueryClient();
  const { openEntity, closeRevision } = useAuditEntityDialog();
  const ctx: Ctx | null = user?.id ? { userId: user.id, isAdmin, isCaseHandler: userRole === "saksbehandler" } : null;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [code, setCode] = useState(findingKey.code);
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [senderName, setSenderName] = useState("—");
  const [pending, setPending] = useState<ReminderActionId | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  const keyStr = `${findingKey.code}:${findingKey.entityType}:${findingKey.entityId}`;

  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;
    (async () => {
      const l = await loadEntity(findingKey, ctx);
      if (cancelled || !l) return;
      // Deep links without a message carry no code — infer it from the mission status.
      const effectiveCode = findingKey.code || (findingKey.entityType === "mission" ? missionCodeForStatus(l.state.missionStatus) ?? "" : "");
      let rem: Reminder | null = null;
      const cols = "id, sender_id, recipient_id, company_id, subject, finding_key, thread_root_id";
      if (messageId) {
        const { data } = await supabase.from("internal_messages").select(cols).eq("id", messageId).maybeSingle();
        rem = (data as Reminder | null) ?? null;
      }
      if (!rem) {
        const { data } = await supabase.from("internal_messages").select(cols)
          .eq("recipient_id", ctx.userId)
          .ilike("finding_key", `%:${findingKey.entityType}:${findingKey.entityId}%`)
          .order("created_at", { ascending: false }).limit(1);
        rem = (data?.[0] as Reminder | undefined) ?? null;
      }
      if (rem?.sender_id) {
        const { data: p } = await supabase.from("profiles").select("full_name").eq("id", rem.sender_id).maybeSingle();
        if (!cancelled) setSenderName(p?.full_name ?? "—");
      }
      if (cancelled) return;
      setCode(effectiveCode);
      setReminder(rem);
      setLoaded(l);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyStr, messageId, user?.id, isAdmin, userRole, closeRevision]);

  const actions = loaded?.allowed ? availableActions(code, loaded.state) : [];

  useEffect(() => {
    onAvailabilityChange?.(keyStr, actions.length);
  }, [keyStr, actions.length, onAvailabilityChange]);

  /** Bulk reminders: mark done only when no other entity in the same message still needs action. */
  const othersStillOpen = useCallback(async (key: string | null): Promise<boolean> => {
    if (!ctx) return false;
    const others = parseFindingKeys(key).filter((k) => !(k.entityType === findingKey.entityType && k.entityId === findingKey.entityId));
    for (const k of others) {
      const l = await loadEntity(k, ctx);
      if (l && availableActions(k.code, l.state).length > 0) return true;
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyStr, user?.id]);

  const label = (a: ReminderActionId) => t(`reminders.actions.${a}`);

  const handleClick = (a: ReminderActionId) => {
    if (a === "uploadLog") { setUploadOpen(true); return; }
    if (a === "changeDate") {
      if (onEditMission) onEditMission(findingKey.entityId);
      else navigate(`/oppdrag?id=${findingKey.entityId}`);
      return;
    }
    if (ACTION_KIND[a] === "open") {
      const targetByAction: Partial<Record<ReminderActionId, EntityOpenTarget>> = {
        closeIncident: "incident-close", selectResponsible: "incident-responsible", openAuditTask: "detail",
        startRiskAssessment: "risk-start", openRiskAssessment: "risk-readonly", editCompetency: "competency-edit",
        uploadDocumentVersion: "document-version", uploadEmergencyPlan: "emergency-plan", openDroneMaintenance: "drone-maintenance",
      };
      if (a === "reportIncident") {
        const target = code === "MissingRiskAssessment" ? "incident-report-missing-risk" : code === "SoraEnvelopeExceeded" ? "incident-report-sora" : "incident-report-no-go";
        void openEntity(findingKey.entityType, findingKey.entityId, target);
      } else if (canOpenEntity(findingKey.entityType)) {
        void openEntity(findingKey.entityType, findingKey.entityId, targetByAction[a] ?? "detail");
      } else if (openPath) navigate(openPath);
      return;
    }
    setComment("");
    setPending(a);
  };

  const execute = async () => {
    if (!pending || !user?.id || !loaded) return;
    const action = pending;
    setSaving(true);
    try {
      const status = targetMissionStatus(action);
      if (status) {
        const { error } = await supabase.from("missions").update({ status }).eq("id", findingKey.entityId);
        if (error) throw error;
      } else if (action === "endFlight") {
        if (!loaded.flight) throw new Error("flight_not_found");
        await clearActiveFlight({ profileId: loaded.flight.profile_id, missionId: loaded.flight.mission_id, publishMode: loaded.flight.publish_mode });
      } else if (action === "takeResponsibility") {
        const { error } = await supabase.from("incidents")
          .update({ oppfolgingsansvarlig_id: user.id, oppdatert_dato: new Date().toISOString() })
          .eq("id", findingKey.entityId);
        if (error) throw error;
      } else if (action === "addIncidentComment") {
        const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
        const { error } = await supabase.from("incident_comments").insert({ incident_id: findingKey.entityId, user_id: user.id, comment_text: comment.trim(), created_by_name: me?.full_name ?? user.email ?? "—" });
        if (error) throw error;
      } else if (action === "writeMissionExplanation") {
        const { data: mission } = await supabase.from("missions").select("merknader").eq("id", findingKey.entityId).single();
        const note = `[${new Date().toLocaleString("nb-NO")}] ${comment.trim()}`;
        const { error } = await supabase.from("missions").update({ merknader: [mission?.merknader, note].filter(Boolean).join("\n\n") }).eq("id", findingKey.entityId);
        if (error) throw error;
      }

      // Audit trail: reply in the reminder thread with action, who and when.
      const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      const who = me?.full_name ?? user.email ?? "—";
      const when = new Date().toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" });
      if (reminder?.sender_id && reminder.sender_id !== user.id) {
        const body = [
          t("reminders.replyBody", { action: label(action), who, when, title: loaded.title }),
          comment.trim() ? `\n${t("reminders.commentLabel")}: ${comment.trim()}` : "",
        ].join("");
        const deepLink = findingKey.entityType === "incident"
          ? `/hendelser?id=${findingKey.entityId}`
          : findingKey.entityType === "mission" ? `/oppdrag?mission=${findingKey.entityId}` : null;
        const { data: reply, error: msgErr } = await supabase.from("internal_messages").insert({
          company_id: reminder.company_id,
          sender_id: user.id,
          recipient_id: reminder.sender_id,
          subject: `Re: ${reminder.subject}`,
          body,
          deep_link: deepLink,
          parent_id: reminder.id,
          thread_root_id: reminder.thread_root_id ?? reminder.id,
          severity: "info",
        }).select("id").single();
        if (msgErr) console.warn("[ReminderActionCard] reply failed", msgErr);
        else if (reply) {
          // A DB trigger also creates this row; the upsert is a conflict-safe safety net.
          await supabase.from("internal_message_recipients")
            .upsert({ message_id: reply.id, recipient_id: reminder.sender_id }, { onConflict: "message_id,recipient_id", ignoreDuplicates: true });
        }
      }

      toast.success(reminder?.sender_id && reminder.sender_id !== user.id
        ? t("reminders.toastNotified", { action: label(action), name: senderName })
        : t("reminders.toast", { action: label(action) }));
      qc.invalidateQueries({ queryKey: ["audit"] });
      qc.invalidateQueries({ queryKey: ["inbox"] });
      setPending(null);
      setHidden(true);
      if (action === "flown") setUploadOpen(true);
      else onDone?.();
    } catch (e) {
      toast.error(t("reminders.failed"), { description: String((e as Error).message ?? e) });
    } finally {
      setSaving(false);
    }
  };

  if (hidden && !uploadOpen) return null;
  const showCard = !hidden && loaded && (actions.length > 0 || !!openPath);

  return (
    <>
      {showCard && (
        <div className={cn("rounded-lg border border-status-yellow/50 bg-status-yellow/10 p-3 space-y-2", className)}>
          <div className="flex items-start gap-2 text-sm font-medium">
            <BellRing className="w-4 h-4 mt-0.5 shrink-0 text-status-yellow" />
            <span className="break-words">
              {actions.length > 0 ? t(`reminders.prompt.${code}`, { title: loaded!.title }) : loaded!.title}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button key={a} size="sm" variant={a === preselect ? "default" : "outline"} onClick={() => handleClick(a)}>
                {label(a)}
              </Button>
            ))}
            {openPath && (
              <Button size="sm" variant="ghost" onClick={() => navigate(openPath)}>
                {t("reminders.open")} <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={!!pending} onOpenChange={(o) => !saving && !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending ? label(pending) : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending && t(`reminders.confirm.${pending}`, { title: loaded?.title ?? "—" })}
              {pending && reminder?.sender_id && reminder.sender_id !== user?.id && (
                <> {t("reminders.confirmNotify", { name: senderName })}</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("reminders.commentPlaceholder")} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); execute(); }} disabled={saving || ((pending === "addIncidentComment" || pending === "writeMissionExplanation") && !comment.trim())}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("reminders.confirmButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {findingKey.entityType === "mission" && (
        <UploadDroneLogDialog
          open={uploadOpen}
          onOpenChange={(o) => { setUploadOpen(o); if (!o && hidden) onDone?.(); }}
          defaultMissionId={findingKey.entityId}
        />
      )}
    </>
  );
};

