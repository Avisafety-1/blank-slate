import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface MessageParty {
  id: string;
  full_name: string | null;
  email: string | null;
  company_name: string | null;
}

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
  parent_id: string | null;
  thread_root_id: string | null;
  is_broadcast?: boolean;
  sender_name?: string | null;
  sender_email?: string | null;
  sender_company?: string | null;
  recipients?: MessageParty[];
  /** Number of unread messages in this thread (received messages only). */
  thread_unread_count?: number;
  /** Total number of messages fetched for this thread. */
  thread_message_count?: number;
  /** All message ids belonging to this thread row. */
  thread_message_ids?: string[];
}

/** Fetch profile + company info for a set of user ids (cross-company safe). */
export async function fetchParties(ids: string[]): Promise<Map<string, MessageParty>> {
  const map = new Map<string, MessageParty>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return map;
  const { data } = await supabase.rpc("get_message_parties", { _ids: unique });
  for (const p of (data ?? []) as MessageParty[]) {
    map.set(p.id, {
      id: p.id,
      full_name: p.full_name ?? null,
      email: p.email ?? null,
      company_name: p.company_name ?? null,
    });
  }
  return map;
}


export function useInboxMessages(filter: "all" | "unread" | "done" | "sent" = "all") {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["inbox", user?.id, filter],
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async (): Promise<InboxMessage[]> => {
      let rows: Record<string, unknown>[] = [];

      if (filter === "sent") {
        const { data, error } = await supabase
          .from("internal_messages")
          .select("*")
          .eq("sender_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        rows = (data ?? []) as Record<string, unknown>[];
      } else {
        let q = supabase
          .from("internal_message_recipients")
          .select("status, read_at, done_at, message:internal_messages(*)")
          .eq("recipient_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(200);
        if (filter === "unread") q = q.eq("status", "unread");
        if (filter === "done") q = q.eq("status", "done");
        const { data, error } = await q;
        if (error) throw error;
        rows = (data ?? [])
          .filter((r) => !!(r as { message?: unknown }).message)
          .map((r) => {
            const rec = r as { status: string; read_at: string | null; done_at: string | null; message: Record<string, unknown> };
            return { ...rec.message, status: rec.status, read_at: rec.read_at, done_at: rec.done_at };
          });
        rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      }

      const messageIds = rows.map((m) => m.id as string);
      const recipientRows = messageIds.length
        ? (
            await supabase
              .from("internal_message_recipients")
              .select("message_id, recipient_id")
              .in("message_id", messageIds)
          ).data ?? []
        : [];

      const partyIds = [
        ...rows.map((m) => m.sender_id as string | null),
        ...recipientRows.map((r) => r.recipient_id),
        ...rows.map((m) => m.recipient_id as string | null),
      ].filter(Boolean) as string[];
      const parties = await fetchParties(partyIds);

      const byMessage = new Map<string, MessageParty[]>();
      for (const r of recipientRows) {
        // Keep the recipient even if we could not resolve their profile, so
        // reply targets never disappear in cross-company threads.
        const p: MessageParty = parties.get(r.recipient_id) ?? {
          id: r.recipient_id,
          full_name: null,
          email: null,
          company_name: null,
        };
        const list = byMessage.get(r.message_id) ?? [];
        list.push(p);
        byMessage.set(r.message_id, list);
      }


      return rows.map((m) => {
        const sender = m.sender_id ? parties.get(m.sender_id as string) : null;
        const fallbackRecipient = m.recipient_id ? parties.get(m.recipient_id as string) : null;
        return {
          ...(m as unknown as InboxMessage),
          sender_name: sender?.full_name ?? null,
          sender_email: sender?.email ?? null,
          sender_company: sender?.company_name ?? null,
          recipients: byMessage.get(m.id as string) ?? (fallbackRecipient ? [fallbackRecipient] : []),
        } as InboxMessage;
      });
    },
  });

  // Realtime
  useEffect(() => {
    if (!user?.id) return;
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["inbox-unread-count"] });
      qc.invalidateQueries({ queryKey: ["inbox-thread"] });
    };
    const channel = supabase
      .channel(`inbox-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_message_recipients", filter: `recipient_id=eq.${user.id}` },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_messages", filter: `recipient_id=eq.${user.id}` },
        invalidate,
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
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "read" | "done" }) => {
      const patch: { status: "read" | "done"; read_at?: string; done_at?: string } = { status };
      if (status === "read") patch.read_at = new Date().toISOString();
      if (status === "done") patch.done_at = new Date().toISOString();

      const { error } = await supabase
        .from("internal_message_recipients")
        .update(patch)
        .eq("message_id", id)
        .eq("recipient_id", user!.id);
      if (error) throw error;

      // Keep the legacy column in sync for older rows / other readers
      await supabase
        .from("internal_messages")
        .update(patch)
        .eq("id", id)
        .eq("recipient_id", user!.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["inbox-unread-count"] });
    },
  });
}
