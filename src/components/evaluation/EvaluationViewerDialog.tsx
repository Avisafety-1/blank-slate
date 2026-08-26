import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import EvaluationResponseDialog from "@/components/evaluation/EvaluationResponseDialog";
import { parseEvaluationStructure } from "@/hooks/useEvaluationTemplates";
import type {
  EvaluationResponseRow,
  EvaluationTemplateLite,
} from "@/hooks/useMissionEvaluation";

interface Props {
  responseId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/**
 * Åpner et evalueringsskjema direkte ut fra id (deeplink eller loggbok),
 * uten å gå veien om oppdragskortet.
 */
export const EvaluationViewerDialog = ({ responseId, open, onOpenChange, onSaved }: Props) => {
  const { t } = useTranslation();
  const [template, setTemplate] = useState<EvaluationTemplateLite | null>(null);
  const [response, setResponse] = useState<EvaluationResponseRow | null>(null);
  const [mission, setMission] = useState<any>(null);

  useEffect(() => {
    if (!open || !responseId) return;
    let cancelled = false;

    (async () => {
      const { data: resp } = await (supabase
        .from("evaluation_responses")
        .select("*")
        .eq("id", responseId)
        .maybeSingle() as any);

      if (cancelled) return;

      if (!resp) {
        toast.error(t("evaluation.mission.lockedHint"));
        onOpenChange(false);
        return;
      }

      const { data: tpl } = await supabase
        .from("evaluation_templates")
        .select("id, title, description, structure")
        .eq("id", (resp as any).template_id)
        .maybeSingle();

      let missionRow: any = null;
      if ((resp as any).mission_id) {
        const { data } = await supabase
          .from("missions")
          .select("id, tittel, company_id, tidspunkt, slutt_tidspunkt, oppdragstype")
          .eq("id", (resp as any).mission_id)
          .maybeSingle();
        missionRow = data;
      }

      if (cancelled) return;

      setMission(
        missionRow ?? {
          id: (resp as any).mission_id,
          tittel: (resp as any).mission_name,
          company_id: (resp as any).company_id,
          tidspunkt: (resp as any).mission_start,
          slutt_tidspunkt: (resp as any).mission_end,
        }
      );
      setTemplate(
        tpl
          ? {
              id: (tpl as any).id,
              title: (tpl as any).title,
              description: (tpl as any).description,
              structure: parseEvaluationStructure((tpl as any).structure).structure,
            }
          : null
      );
      setResponse({
        ...(resp as any),
        scores: ((resp as any).scores ?? {}) as Record<string, number>,
        comments: ((resp as any).comments ?? {}) as Record<string, string>,
      } as EvaluationResponseRow);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, responseId, onOpenChange, t]);

  if (!open || !template || !response) return null;

  return (
    <EvaluationResponseDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setTemplate(null);
          setResponse(null);
          setMission(null);
        }
        onOpenChange(o);
      }}
      mission={mission}
      template={template}
      response={response}
      onSaved={onSaved}
    />
  );
};

export default EvaluationViewerDialog;
