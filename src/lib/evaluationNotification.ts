import { supabase } from "@/integrations/supabase/client";
import i18n from "@/i18n";

/**
 * Sender en intern melding til eleven når instruktøren fullfører et
 * evalueringsskjema. Meldingen har deeplink direkte til skjemaet.
 *
 * Feiler aldri hardt – lagring av evalueringen skal aldri blokkeres.
 */
export const evaluationDeepLink = (responseId: string) =>
  `/oppdrag?evaluation=${responseId}`;

export interface EvaluationNotificationInput {
  responseId: string;
  studentId?: string | null;
  senderId?: string | null;
  missionTitle?: string | null;
}

export async function sendEvaluationNotification({
  responseId,
  studentId,
  senderId,
  missionTitle,
}: EvaluationNotificationInput): Promise<void> {
  if (!responseId || !studentId) return;
  if (senderId && senderId === studentId) return;

  const title = missionTitle?.trim() || i18n.t("evaluation.notification.unknownMission");

  try {
    const { error } = await supabase.functions.invoke("send-message", {
      body: {
        recipient_ids: [studentId],
        subject: i18n.t("evaluation.notification.subject", { mission: title }),
        body: `${i18n.t("evaluation.notification.body", { mission: title })}\n\n${i18n.t(
          "evaluation.notification.logbookHint"
        )}`,
        deep_link: evaluationDeepLink(responseId),
        severity: "info",
      },
    });
    if (error) throw error;
  } catch (err) {
    console.error("[evaluationNotification] could not notify student:", err);
  }
}
