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
}

export const useEvaluationTemplates = () => {
  const { user, companyId, isSuperAdmin } = useAuth();
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
      return (data ?? []).map((row: any) => ({
        ...row,
        structure: Array.isArray(row.structure) ? row.structure : [],
      })) as EvaluationTemplate[];
    },
    enabled: !!companyId,
  });

  const saveTemplate = useMutation({
    mutationFn: async (input: EvaluationTemplateInput) => {
      if (!user || !companyId) throw new Error("Missing session");

      const payload = {
        title: input.title.trim(),
        description: input.description.trim() || null,
        structure: input.structure as any,
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

  return {
    templates: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
    saveTemplate,
    deleteTemplate,
  };
};
