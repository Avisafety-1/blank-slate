import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type ReminderState = "not_sent" | "sent_open" | "sent_closed";

export interface ReminderStatus {
  state: ReminderState;
  total: number;
  done: number;
  lastSentAt: string | null;
}

/**
 * Aggregates internal_messages for the current company by `finding_key`
 * so the compliance alerts panel can show whether a reminder was sent
 * and whether all recipients have marked it done.
 */
export function useReminderStatuses() {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["audit", "reminder-statuses", companyId],
    enabled: !!user?.id && !!companyId,
    staleTime: 15_000,
    queryFn: async (): Promise<Record<string, ReminderStatus>> => {
      const { data, error } = await supabase
        .from("internal_messages")
        .select("finding_key,status,created_at")
        .eq("company_id", companyId!)
        .not("finding_key", "is", null)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;

      const map: Record<string, ReminderStatus> = {};
      for (const row of data ?? []) {
        const key = row.finding_key as string;
        if (!map[key]) map[key] = { state: "not_sent", total: 0, done: 0, lastSentAt: null };
        const s = map[key];
        s.total += 1;
        if (row.status === "done") s.done += 1;
        if (!s.lastSentAt || row.created_at > s.lastSentAt) s.lastSentAt = row.created_at as string;
      }
      for (const key of Object.keys(map)) {
        const s = map[key];
        s.state = s.total === 0 ? "not_sent" : s.done >= s.total ? "sent_closed" : "sent_open";
      }
      return map;
    },
  });

  // Realtime — pick up new reminders / done-marks company-wide.
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`reminder-status-${companyId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_messages", filter: `company_id=eq.${companyId}` },
        () => qc.invalidateQueries({ queryKey: ["audit", "reminder-statuses", companyId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, qc]);

  return query;
}

export const findingKey = (code: string, entityType: string, entityId: string) =>
  `${code}:${entityType}:${entityId}`;
