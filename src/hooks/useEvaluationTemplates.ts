import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface EvaluationSubcategory {
  id: string;
  name: string;
  description: string;
}

export interface EvaluationCategory {
  id: string;
  name: string;
  description: string;
  subcategories: EvaluationSubcategory[];
}

export interface EvaluationTemplate {
  id: string;
  company_id: string | null;
  title: string;
  description: string | null;
  structure: EvaluationCategory[];
  global_visibility: boolean;
  admin_only: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EvaluationTemplateInput {
  id?: string;
  title: string;
  description: string;
  structure: EvaluationCategory[];
  global_visibility: boolean;
  admin_only?: boolean;
}

/** Sentinel entry used to persist template metadata inside `structure` (jsonb). */
const META_ID = "__meta__";

/**
 * Splits the raw jsonb structure into real categories and template metadata.
 */
export const parseEvaluationStructure = (
  raw: unknown
): { structure: EvaluationCategory[]; adminOnly: boolean } => {
  const list = Array.isArray(raw) ? (raw as any[]) : [];
  const meta = list.find((item) => item?.id === META_ID);
  return {
    structure: list.filter((item) => item?.id !== META_ID) as EvaluationCategory[],
    adminOnly: !!meta?.meta?.admin_only,
  };
};

/**
 * Serialises categories + metadata back into the jsonb structure column.
 */
export const serializeEvaluationStructure = (
  structure: EvaluationCategory[],
  adminOnly: boolean
): any[] => {
  const clean = structure.filter((c) => (c as any)?.id !== META_ID);
  if (!adminOnly) return clean;
  return [...clean, { id: META_ID, name: "", description: "", subcategories: [], meta: { admin_only: true } }];
};

export const useEvaluationTemplates = () => {
  const { user, companyId, isSuperAdmin, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["evaluation-templates", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evaluation_templates")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row: any) => {
        const parsed = parseEvaluationStructure(row.structure);
        return {
          ...row,
          structure: parsed.structure,
          admin_only: parsed.adminOnly,
        };
      }) as EvaluationTemplate[];
    },
    enabled: !!companyId,
  });


  const saveTemplate = useMutation({
    mutationFn: async (input: EvaluationTemplateInput) => {
      if (!user || !companyId) throw new Error("Missing session");

      const payload = {
        title: input.title.trim(),
        description: input.description.trim() || null,
        structure: serializeEvaluationStructure(input.structure, !!input.admin_only) as any,
        global_visibility: isSuperAdmin ? input.global_visibility : false,
      };

      if (input.id) {
        const { error } = await supabase
          .from("evaluation_templates")
          .update(payload)
          .eq("id", input.id);
        if (error) throw error;
        return input.id;
      }

      const { data, error } = await supabase
        .from("evaluation_templates")
        .insert({ ...payload, company_id: companyId, created_by: user.id })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evaluation-templates"] });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("evaluation_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evaluation-templates"] });
    },
  });

  // Admin-only templates are hidden entirely from users without an admin role
  const visibleTemplates = (query.data ?? []).filter((tpl) => !tpl.admin_only || isAdmin);

  return {
    templates: visibleTemplates,
    isLoading: query.isLoading,
    refetch: query.refetch,
    saveTemplate,
    deleteTemplate,
  };
};
