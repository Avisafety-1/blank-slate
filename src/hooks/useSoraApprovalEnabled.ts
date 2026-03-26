import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const cache: Record<string, { enabled: boolean; ts: number }> = {};
const CACHE_TTL = 30_000;

export function useSoraApprovalEnabled(): boolean {
  const { companyId } = useAuth();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!companyId) return;

    const cached = cache[companyId];
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setEnabled(cached.enabled);
      return;
    }

    (supabase
      .from("company_sora_config")
      .select("sora_based_approval")
      .eq("company_id", companyId)
      .maybeSingle() as any)
      .then(({ data }: any) => {
        const val = !!data?.sora_based_approval;
        cache[companyId] = { enabled: val, ts: Date.now() };
        setEnabled(val);
      });
  }, [companyId]);

  return enabled;
}
