import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RecipientOption {
  id: string;
  full_name: string | null;
  email: string | null;
  company_id: string | null;
  company_name: string | null;
}

export function useSearchRecipients(query: string) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  return useQuery({
    queryKey: ["message-recipients", debounced],
    staleTime: 30_000,
    queryFn: async (): Promise<RecipientOption[]> => {
      const { data, error } = await supabase.rpc("search_message_recipients", { _query: debounced });
      if (error) throw error;
      return (data ?? []) as RecipientOption[];
    },
  });
}
