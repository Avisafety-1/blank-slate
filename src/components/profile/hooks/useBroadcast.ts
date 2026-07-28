import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BroadcastCompany {
  id: string;
  navn: string;
  user_count: number;
}

/** Companies available as broadcast targets (superadmin only). */
export function useBroadcastCompanies(enabled: boolean) {
  return useQuery({
    queryKey: ["broadcast-companies"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BroadcastCompany[]> => {
      const { data, error } = await supabase.rpc("list_broadcast_companies");
      if (error) throw error;
      return (data ?? []) as BroadcastCompany[];
    },
  });
}

/** Resolve the exact audience for a broadcast (used for the confirmation step). */
export function useBroadcastAudience(
  mode: "all" | "companies" | null,
  companyIds: string[],
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["broadcast-audience", mode, [...companyIds].sort().join(",")],
    enabled: enabled && !!mode && (mode === "all" || companyIds.length > 0),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resolve_broadcast_audience", {
        _mode: mode as string,
        _company_ids: mode === "companies" ? companyIds : null,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
        company_id: string | null;
        company_name: string | null;
      }>;
    },
  });
}
