import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { resolveEffectiveCompanyId } from "@/lib/companyInheritance";

export interface CompanyMissionRole {
  id: string;
  name: string;
}

/**
 * Oppdragsroller for gjeldende selskap. Når morselskapet har
 * `propagate_mission_roles` på, leses morselskapets liste direkte
 * (ingen kopiering, ingen drift).
 */
export function useCompanyMissionRoles() {
  const { companyId } = useAuth();
  const [roles, setRoles] = useState<CompanyMissionRole[]>([]);
  const [isInherited, setIsInherited] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const source = await resolveEffectiveCompanyId(companyId, "mission_roles");
    const { data } = await (supabase as any)
      .from("company_mission_roles")
      .select("id, name")
      .eq("company_id", source)
      .order("name");
    setRoles((data || []) as CompanyMissionRole[]);
    setIsInherited(!!source && source !== companyId);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  return { roles, isInherited, loading, reload: load };
}
