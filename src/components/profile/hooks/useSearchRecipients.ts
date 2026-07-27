import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RecipientOption {
  id: string;
  full_name: string | null;
  email: string | null;
  company_id: string | null;
  company_name: string | null;
}

/**
 * Fetch the full recipient list once (server-limited to 30 without query, or all
 * matches when a query is passed for superadmins with large user base).
 * We then filter client-side for instant typing feedback.
 */
export function useRecipientsList(enabled: boolean) {
  return useQuery({
    queryKey: ["message-recipients-all"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RecipientOption[]> => {
      // Empty query returns up to 30 rows – bump the limit by paging if needed.
      const { data, error } = await supabase.rpc("search_message_recipients", { _query: "" });
      if (error) throw error;
      return (data ?? []) as RecipientOption[];
    },
  });
}

export function useFilteredRecipients(list: RecipientOption[], query: string) {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const name = (r.full_name ?? "").toLowerCase();
      const email = (r.email ?? "").toLowerCase();
      const company = (r.company_name ?? "").toLowerCase();
      return name.includes(q) || email.includes(q) || company.includes(q);
    });
  }, [list, query]);
}

/**
 * Superadmin fallback: if the prefetched list is exhausted (>= 30 rows) and the
 * query has no local matches, hit the server for a broader search.
 */
export function useServerRecipientSearch(query: string, enabled: boolean) {
  return useQuery({
    queryKey: ["message-recipients-search", query],
    enabled: enabled && query.trim().length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<RecipientOption[]> => {
      const { data, error } = await supabase.rpc("search_message_recipients", { _query: query.trim() });
      if (error) throw error;
      return (data ?? []) as RecipientOption[];
    },
  });
}
