import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import type { EvaluationCategory } from "@/hooks/useEvaluationTemplates";

interface Props {
  templateTitle: string;
  categories: EvaluationCategory[];
  scores: Record<string, number>;
  comments: Record<string, string>;
  overallAverage: number | null;
  currentText: string;
  onGenerated: (text: string) => void;
  disabled?: boolean;
}

export const EvaluationAiSummaryButton = ({
  templateTitle,
  categories,
  scores,
  comments,
  overallAverage,
  currentText,
  onGenerated,
  disabled,
}: Props) => {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);

  const hasScores = Object.values(scores).some((v) => typeof v === "number" && v > 0);

  const generate = async () => {
    setLoading(true);
    try {
      const payloadCategories = categories.map((cat) => {
        const values = cat.subcategories
          .map((s) => scores[s.id])
          .filter((v): v is number => typeof v === "number" && v > 0);
        return {
          name: cat.name,
          average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
          subcategories: cat.subcategories.map((sub) => ({
            name: sub.name,
            score: typeof scores[sub.id] === "number" && scores[sub.id] > 0 ? scores[sub.id] : null,
            comment: comments[sub.id]?.trim() || null,
          })),
        };
      });

      const { data, error } = await supabase.functions.invoke("evaluate-summary-ai", {
        body: {
          templateTitle,
          language: i18n.language === "en" ? "en" : "no",
          overallAverage,
          categories: payloadCategories,
        },
      });

      if (error) throw error;
      const summary: string | undefined = (data as any)?.summary;
      if (!summary) throw new Error((data as any)?.error || "empty");

      if (currentText.trim()) {
        setPendingText(summary);
      } else {
        onGenerated(summary);
        toast.success(t("evaluation.ai.done"));
      }
    } catch (err: any) {
      const msg = err?.context?.status === 429
        ? t("evaluation.ai.errorRateLimit")
        : err?.context?.status === 402
          ? t("evaluation.ai.errorCredits")
          : t("evaluation.ai.error");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={generate}
          disabled={disabled || loading || !hasScores}
          title={!hasScores ? t("evaluation.ai.needScores") : undefined}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {loading ? t("evaluation.ai.loading") : t("evaluation.ai.button")}
        </Button>
        {!hasScores && (
          <span className="text-xs text-muted-foreground">{t("evaluation.ai.needScores")}</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("evaluation.ai.help")}</p>

      <AlertDialog open={pendingText !== null} onOpenChange={(o) => !o && setPendingText(null)}>
        <AlertDialogContent className="z-[1300]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("evaluation.ai.replaceTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("evaluation.ai.replaceDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <Button
              variant="secondary"
              onClick={() => {
                if (pendingText) onGenerated(`${currentText.trim()}\n\n${pendingText}`);
                setPendingText(null);
              }}
            >
              {t("evaluation.ai.append")}
            </Button>
            <AlertDialogAction
              onClick={() => {
                if (pendingText) onGenerated(pendingText);
                setPendingText(null);
              }}
            >
              {t("evaluation.ai.replace")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EvaluationAiSummaryButton;
