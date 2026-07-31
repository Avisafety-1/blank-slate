import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useUnreadMessagesCount() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["inbox-unread-count", user?.id],
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async (): Promise<number> => {
      // Count unread *threads*, not individual messages, so a busy conversation
      // only bumps the badge once.
      const { data, error } = await supabase
        .from("internal_message_recipients")
        .select("message_id, message:internal_messages(id, thread_root_id)")
        .eq("recipient_id", user!.id)
        .eq("status", "unread")
        .limit(500);
      if (error) throw error;

      const threads = new Set<string>();
      for (const row of data ?? []) {
        const msg = (row as { message?: { id: string; thread_root_id: string | null } | null }).message;
        threads.add(msg?.thread_root_id ?? msg?.id ?? (row as { message_id: string }).message_id);
      }
      return threads.size;
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel(
      `inbox-count-${user.id}-${Math.random().toString(36).slice(2)}`,
    );
    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_message_recipients", filter: `recipient_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["inbox-unread-count"] }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  return query.data ?? 0;
}
