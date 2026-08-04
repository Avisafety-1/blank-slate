import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CompanyMissionType {
  id: string;
  company_id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  default_document_id: string | null;
  default_evaluation_template_id: string | null;
}

export const DEFAULT_MISSION_TYPES = [
  "Inspeksjon",
  "Kartlegging",
  "Foto/film",
  "Filming",
  "Fotografering",
  "Søk og redning",
  "Landbruk",
  "Bygg/anlegg",
  "Forskning",
  "Levering",
];

/**
 * Returns the effective list of mission types for the current company.
 * If the parent company has `propagate_mission_types = true`, the parent's
 * list is used instead of the user's own.
 */
export function useCompanyMissionTypes() {
  const { companyId, parentCompanyId } = useAuth();
  const [types, setTypes] = useState<CompanyMissionType[]>([]);
  const [effectiveCompanyId, setEffectiveCompanyId] = useState<string | null>(null);
  const [isInherited, setIsInherited] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);

    let source = companyId;
    let inherited = false;

    if (parentCompanyId) {
      const { data: parent } = await (supabase
        .from("companies")
        .select("propagate_mission_types")
        .eq("id", parentCompanyId)
        .maybeSingle() as any);
      if (parent?.propagate_mission_types) {
        source = parentCompanyId;
        inherited = true;
      }
    }

    const { data } = await (supabase
      .from("company_mission_types")
      .select("id, company_id, label, sort_order, is_active, default_document_id, default_evaluation_template_id")
      .eq("company_id", source)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true }) as any);

    setTypes((data || []) as CompanyMissionType[]);
    setEffectiveCompanyId(source);
    setIsInherited(inherited);
    setLoading(false);
  }, [companyId, parentCompanyId]);

  useEffect(() => {
    load();
  }, [load]);

  const activeLabels = (types.filter((t) => t.is_active).map((t) => t.label));
  const labels = activeLabels.length > 0 ? activeLabels : DEFAULT_MISSION_TYPES;

  return {
    types,
    labels,
    isInherited,
    effectiveCompanyId,
    loading,
    reload: load,
  };
}
