import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchParties, type MessageParty } from "./useInboxMessages";

export interface ThreadMessage {
  id: string;
  sender_id: string | null;
  recipient_id: string;
  subject: string;
  body: string;
  created_at: string;
  parent_id: string | null;
  thread_root_id: string | null;
  is_broadcast?: boolean;
  sender_name?: string | null;
  sender_email?: string | null;
  sender_company?: string | null;
}

export interface ThreadData {
  messages: ThreadMessage[];
  participants: MessageParty[];
}

export function useMessageThread(threadRootId: string | null | undefined) {
  return useQuery({
    queryKey: ["inbox-thread", threadRootId],
    enabled: !!threadRootId,
    staleTime: 0,
    queryFn: async (): Promise<ThreadData> => {
      const { data, error } = await supabase
        .from("internal_messages")
        .select("id, sender_id, recipient_id, subject, body, created_at, parent_id, thread_root_id, is_broadcast")
        .or(`thread_root_id.eq.${threadRootId},id.eq.${threadRootId}`)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const msgs = data ?? [];
      const messageIds = msgs.map((m) => m.id);
      const recipientRows = messageIds.length
        ? (
            await supabase
              .from("internal_message_recipients")
              .select("message_id, recipient_id")
              .in("message_id", messageIds)
          ).data ?? []
        : [];

      const ids = [
        ...msgs.map((m) => m.sender_id),
        ...msgs.map((m) => m.recipient_id),
        ...recipientRows.map((r) => r.recipient_id),
      ].filter(Boolean) as string[];
      const parties = await fetchParties(ids);

      const participants = Array.from(new Set(ids))
        .map((id) => parties.get(id))
        .filter(Boolean) as MessageParty[];

      const messages = msgs.map((m) => {
        const sender = m.sender_id ? parties.get(m.sender_id) : null;
        return {
          ...m,
          sender_name: sender?.full_name ?? null,
          sender_email: sender?.email ?? null,
          sender_company: sender?.company_name ?? null,
        } as ThreadMessage;
      });

      return { messages, participants };
    },
  });
}
