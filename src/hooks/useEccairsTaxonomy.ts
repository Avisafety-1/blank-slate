import { useQuery } from "@tanstack/react-query";

export interface EccairsValueListItem {
  id: number;
  value_list_key: string;
  value_id: string;
  value_synonym: string;
  value_description: string | null;
  extra: Record<string, unknown> | null;
}

export function useEccairsTaxonomy(valueListKey: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['eccairs-taxonomy', valueListKey],
    queryFn: async () => {
      // Direct fetch using PostgREST with schema header for eccairs schema
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/value_list_items?value_list_key=eq.${encodeURIComponent(valueListKey)}&order=value_id`,
        {
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Accept-Profile': 'eccairs',
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch taxonomy');
      }
      
      return response.json() as Promise<EccairsValueListItem[]>;
    },
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    enabled,
  });
}
