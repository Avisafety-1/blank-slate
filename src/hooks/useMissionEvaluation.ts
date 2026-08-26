import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyMissionTypes } from "@/hooks/useCompanyMissionTypes";
import { parseEvaluationStructure, type EvaluationCategory } from "@/hooks/useEvaluationTemplates";

export interface EvaluationResponseRow {
  id: string;
  template_id: string;
  mission_id: string | null;
  student_id: string | null;
  student_name: string | null;
  instructor_id: string | null;
  instructor_name: string | null;
  scores: Record<string, number>;
  comments: Record<string, string>;
  overall_comment: string | null;
  overall_average: number | null;
  status: string;
  evaluated_at?: string | null;
  share_with_admins?: boolean | null;
  extra_viewer_ids?: string[] | null;
  student_signature_url?: string | null;
  student_signed_at?: string | null;
  student_signature_name?: string | null;
}


export interface EvaluationTemplateLite {
  id: string;
  title: string;
  description: string | null;
  structure: EvaluationCategory[];
}

/**
 * Resolves whether a mission's mission type has an evaluation template attached,
 * and loads any existing evaluation response for that mission.
 */
export function useMissionEvaluation(missionId?: string | null, oppdragstype?: string | null) {
  const { companyId, isAdmin } = useAuth();
  const { types, loading: typesLoading } = useCompanyMissionTypes();

  const [template, setTemplate] = useState<EvaluationTemplateLite | null>(null);
  const [response, setResponse] = useState<EvaluationResponseRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [existsStatus, setExistsStatus] = useState<string | null>(null);
  const [canView, setCanView] = useState(true);

  const templateId = useMemo(() => {
    if (!oppdragstype) return null;
    const match = types.find(
      (t) => t.label?.trim().toLowerCase() === String(oppdragstype).trim().toLowerCase()
    );
    return match?.default_evaluation_template_id ?? null;
  }, [types, oppdragstype]);

  const load = useCallback(async () => {
    if (!templateId || !missionId) {
      setTemplate(null);
      setResponse(null);
      setExistsStatus(null);
      setCanView(true);
      return;
    }
    setLoading(true);
    const [{ data: tpl }, { data: resp }] = await Promise.all([
      supabase
        .from("evaluation_templates")
        .select("id, title, description, structure")
        .eq("id", templateId)
        .maybeSingle(),
      (supabase
        .from("evaluation_responses")
        .select("*")
        .eq("mission_id", missionId)
        .eq("template_id", templateId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle() as any),
    ]);

    // Access-aware state: tells us if an evaluation exists even when RLS hides it
    const { data: stateRows } = await (supabase.rpc as any)("get_mission_evaluation_state", {
      p_mission_id: missionId,
      p_template_id: templateId,
    });
    const state = Array.isArray(stateRows) ? stateRows[0] : stateRows;
    setExistsStatus(state?.response_exists ? state?.response_status ?? "draft" : null);
    setCanView(state?.response_exists ? !!state?.can_view : true);

    const parsedTpl = tpl ? parseEvaluationStructure((tpl as any).structure) : null;
    // Frontend-guard: admin-only templates are not exposed to non-admins
    const blocked = !!parsedTpl?.adminOnly && !isAdmin;
    setTemplate(
      tpl && !blocked
        ? {
            id: (tpl as any).id,
            title: (tpl as any).title,
            description: (tpl as any).description,
            structure: parsedTpl!.structure,
          }
        : null
    );
    setResponse(
      resp
        ? ({
            ...(resp as any),
            scores: ((resp as any).scores ?? {}) as Record<string, number>,
            comments: ((resp as any).comments ?? {}) as Record<string, string>,
          } as EvaluationResponseRow)
        : null
    );
    setLoading(false);
  }, [templateId, missionId, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    hasEvaluation: !!templateId,
    templateId,
    template,
    response,
    status: response?.status ?? existsStatus,
    canView,
    loading: loading || typesLoading,
    companyId,
    reload: load,
  };
}
