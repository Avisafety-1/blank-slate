import { supabase } from "@/integrations/supabase/client";

/**
 * Oppretter (eller fortsetter) en intern gruppesamtale når noen tagges med @
 * i merknadene på et oppdrag. Tråden får deeplink til oppdraget.
 *
 * E-postvarsling håndteres separat av `send-notification-email` – denne
 * funksjonen legger kun til meldingstråden i innboksen (+ push via send-message).
 */
export interface MissionMentionThreadInput {
  missionId: string;
  missionTitle: string;
  note: string;
  senderName?: string | null;
  recipientIds: string[];
}

export const missionDeepLink = (missionId: string) => `/oppdrag?id=${missionId}`;

export async function createMissionMentionThread({
  missionId,
  missionTitle,
  note,
  senderName,
  recipientIds,
}: MissionMentionThreadInput): Promise<void> {
  const recipients = Array.from(new Set(recipientIds.filter(Boolean)));
  if (!recipients.length || !missionId) return;

  const deepLink = missionDeepLink(missionId);
  const subject = missionTitle?.trim() || "Oppdrag";
  const body = senderName ? `${senderName}:\n${note.trim()}` : note.trim();

  try {
    // Finnes det allerede en tråd for dette oppdraget som jeg har tilgang til?
    const { data: existing } = await supabase
      .from("internal_messages")
      .select("id, thread_root_id, created_at")
      .eq("deep_link", deepLink)
      .eq("is_broadcast", false)
      .order("created_at", { ascending: false })
      .limit(1);

    const parentId = existing?.[0]?.id ?? null;

    const { error } = await supabase.functions.invoke("send-message", {
      body: {
        recipient_ids: recipients,
        subject,
        body,
        deep_link: deepLink,
        parent_id: parentId,
        severity: "info",
      },
    });
    if (error) throw error;
  } catch (err) {
    // Meldingstråden er en tilleggsfunksjon – aldri blokker lagring av oppdraget.
    console.error("[missionMentionThread] could not create mention thread:", err);
  }
}
