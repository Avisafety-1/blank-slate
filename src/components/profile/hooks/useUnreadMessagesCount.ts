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
      const { count, error } = await supabase
        .from("internal_messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user!.id)
        .eq("status", "unread");
      if (error) throw error;
      return count ?? 0;
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
        { event: "*", schema: "public", table: "internal_messages", filter: `recipient_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["inbox-unread-count"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  return query.data ?? 0;
}
