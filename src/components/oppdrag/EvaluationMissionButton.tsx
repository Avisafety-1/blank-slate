import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMissionEvaluation } from "@/hooks/useMissionEvaluation";
import EvaluationResponseDialog from "@/components/evaluation/EvaluationResponseDialog";

interface Props {
  mission: any;
  className?: string;
  size?: "sm" | "default";
  onSaved?: () => void;
}

export const EvaluationMissionButton = ({ mission, className, size = "sm", onSaved }: Props) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { hasEvaluation, template, response, status, reload } = useMissionEvaluation(
    mission?.id,
    mission?.oppdragstype
  );

  if (!hasEvaluation || !template) return null;

  const label =
    status === "completed"
      ? t("evaluation.mission.view")
      : status === "draft"
      ? t("evaluation.mission.continue")
      : t("evaluation.mission.perform");

  return (
    <>
      <Button
        size={size}
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <ClipboardCheck className="h-4 w-4 mr-1" />
        {label}
      </Button>

      {open && (
        <EvaluationResponseDialog
          open={open}
          onOpenChange={setOpen}
          mission={mission}
          template={template}
          response={response}
          onSaved={() => {
            reload();
            onSaved?.();
          }}
        />
      )}
    </>
  );
};

export default EvaluationMissionButton;
