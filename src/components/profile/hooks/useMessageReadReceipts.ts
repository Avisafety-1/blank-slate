import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchParties, type MessageParty } from "./useInboxMessages";

export interface ReadReceipt {
  message_id: string;
  recipient_id: string;
  read_at: string | null;
  party: MessageParty;
}

/**
 * Read receipts ("Sett av …") for a thread's messages.
 * RLS lets thread participants read the recipient rows of messages they can access.
 */
export function useMessageReadReceipts(messageIds: string[]) {
  const key = [...messageIds].sort().join(",");
  return useQuery({
    queryKey: ["message-read-receipts", key],
    enabled: messageIds.length > 0,
    staleTime: 0,
    queryFn: async (): Promise<ReadReceipt[]> => {
      const { data, error } = await supabase
        .from("internal_message_recipients")
        .select("message_id, recipient_id, read_at")
        .in("message_id", messageIds);
      if (error) throw error;

      const rows = (data ?? []) as { message_id: string; recipient_id: string; read_at: string | null }[];
      const parties = await fetchParties(rows.map((r) => r.recipient_id));
      return rows.map((r) => ({
        ...r,
        party:
          parties.get(r.recipient_id) ??
          ({ id: r.recipient_id, full_name: null, email: null, company_name: null } as MessageParty),
      }));
    },
  });
}
