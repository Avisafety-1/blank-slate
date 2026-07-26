import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface InboxMessage {
  id: string;
  company_id: string;
  sender_id: string | null;
  recipient_id: string;
  subject: string;
  body: string;
  deep_link: string | null;
  finding_key: string | null;
  severity: "critical" | "warning" | "info";
  status: "unread" | "read" | "done";
  read_at: string | null;
  done_at: string | null;
  created_at: string;
  sender_name?: string | null;
}

export function useInboxMessages(filter: "all" | "unread" | "done" = "all") {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["inbox", user?.id, filter],
    enabled: !!user?.id,
    queryFn: async (): Promise<InboxMessage[]> => {
      let q = supabase
        .from("internal_messages")
        .select("*")
        .eq("recipient_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter === "unread") q = q.eq("status", "unread");
      if (filter === "done") q = q.eq("status", "done");
      const { data, error } = await q;
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
      })) as InboxMessage[];
    },
  });

  // Realtime
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`inbox-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_messages", filter: `recipient_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["inbox"] });
          qc.invalidateQueries({ queryKey: ["inbox-unread-count"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  return query;
}

export function useMarkMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "read" | "done" }) => {
      const patch: Record<string, unknown> = { status };
      if (status === "read") patch.read_at = new Date().toISOString();
      if (status === "done") patch.done_at = new Date().toISOString();
      const { error } = await supabase.from("internal_messages").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["inbox-unread-count"] });
    },
  });
}
