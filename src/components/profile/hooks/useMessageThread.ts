import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ThreadMessage {
  id: string;
  sender_id: string | null;
  recipient_id: string;
  subject: string;
  body: string;
  created_at: string;
  parent_id: string | null;
  thread_root_id: string | null;
  sender_name?: string | null;
}

export function useMessageThread(threadRootId: string | null | undefined) {
  return useQuery({
    queryKey: ["inbox-thread", threadRootId],
    enabled: !!threadRootId,
    staleTime: 0,
    queryFn: async (): Promise<ThreadMessage[]> => {
      const { data, error } = await supabase
        .from("internal_messages")
        .select("id, sender_id, recipient_id, subject, body, created_at, parent_id, thread_root_id")
        .or(`thread_root_id.eq.${threadRootId},id.eq.${threadRootId}`)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const senderIds = Array.from(new Set((data ?? []).map((m) => m.sender_id).filter(Boolean))) as string[];
      let senderMap = new Map<string, string>();
      if (senderIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", senderIds);
        senderMap = new Map((profs ?? []).map((p) => [p.id, p.full_name ?? ""]));
      }
      return (data ?? []).map((m) => ({
        ...m,
        sender_name: m.sender_id ? senderMap.get(m.sender_id) ?? null : null,
      })) as ThreadMessage[];
    },
  });
}
