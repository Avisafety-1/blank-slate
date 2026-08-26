import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutoTextarea } from "@/components/ui/auto-textarea";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { GraduationCap, User, Plane, CalendarClock, ClipboardCheck } from "lucide-react";
import type { EvaluationCategory } from "@/hooks/useEvaluationTemplates";

export interface EvaluationHeaderValues {
  instructorName?: string;
  studentName?: string;
  missionName?: string;
  missionTime?: string;
  evaluatedAt?: string;
}

interface EvaluationFormPreviewProps {
  title: string;
  description?: string;
  categories: EvaluationCategory[];
  header?: EvaluationHeaderValues;
  /** When true, header fields are disabled (design preview mode) */
  headerDisabled?: boolean;
  /** Optional custom controls replacing the default header inputs */
  instructorSlot?: React.ReactNode;
  studentSlot?: React.ReactNode;
  evaluatedAtSlot?: React.ReactNode;
  /** Optional visibility/permissions block rendered under the header fields */
  visibilitySlot?: React.ReactNode;
  /** Optional element rendered inside the overall-assessment card (e.g. AI button) */
  overallAiSlot?: React.ReactNode;
  /** Optional student signature block rendered below the overall assessment */
  signatureSlot?: React.ReactNode;


  scores?: Record<string, number>;
  comments?: Record<string, string>;
  overallComment?: string;
  onScoreChange?: (subId: string, score: number) => void;
  onCommentChange?: (subId: string, comment: string) => void;
  onOverallCommentChange?: (value: string) => void;
}

const SCALE = [1, 2, 3, 4, 5, 6];

export const EvaluationFormPreview = ({
  title,
  description,
  categories,
  header,
  headerDisabled = true,
  instructorSlot,
  studentSlot,
  evaluatedAtSlot,
  visibilitySlot,
  overallAiSlot,
  signatureSlot,



  scores: controlledScores,
  comments: controlledComments,
  overallComment: controlledOverall,
  onScoreChange,
  onCommentChange,
  onOverallCommentChange,
}: EvaluationFormPreviewProps) => {
  const { t } = useTranslation();
  const [localScores, setLocalScores] = useState<Record<string, number>>({});
  const [localComments, setLocalComments] = useState<Record<string, string>>({});
  const [localOverall, setLocalOverall] = useState("");

  const scores = controlledScores ?? localScores;
  const comments = controlledComments ?? localComments;
  const overallComment = controlledOverall ?? localOverall;

  const setScore = (subId: string, value: number) => {
    if (onScoreChange) onScoreChange(subId, value);
    else setLocalScores((prev) => ({ ...prev, [subId]: prev[subId] === value ? 0 : value }));
  };

  const setComment = (subId: string, value: string) => {
    if (onCommentChange) onCommentChange(subId, value);
    else setLocalComments((prev) => ({ ...prev, [subId]: value }));
  };

  const setOverall = (value: string) => {
    if (onOverallCommentChange) onOverallCommentChange(value);
    else setLocalOverall(value);
  };

  const categoryAverages = useMemo(() => {
    const result: Record<string, number | null> = {};
    categories.forEach((cat) => {
      const values = cat.subcategories
        .map((sub) => scores[sub.id])
        .filter((v): v is number => typeof v === "number" && v > 0);
      result[cat.id] = values.length
        ? values.reduce((a, b) => a + b, 0) / values.length
        : null;
    });
    return result;
  }, [categories, scores]);

  const overallAverage = useMemo(() => {
    const values = Object.values(categoryAverages).filter(
      (v): v is number => typeof v === "number"
    );
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }, [categoryAverages]);

  const fmt = (value: number | null) => (value === null ? "–" : value.toFixed(1));

  return (
    <div className="space-y-4">
      {/* Header card */}
      <Card className="overflow-hidden p-0 border-evaluation-banner/20">
        <div className="bg-evaluation-banner text-evaluation-banner-foreground px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-evaluation-banner-accent p-2 shrink-0">
              <ClipboardCheck className="h-5 w-5 text-evaluation-banner-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-evaluation-banner-muted">
                {t("evaluation.formLabel")}
              </p>
              <h3 className="text-lg font-semibold break-words leading-tight">
                {title.trim() || t("evaluation.untitled")}
              </h3>
              {description?.trim() && (
                <p className="text-sm text-evaluation-banner-muted break-words mt-0.5">{description}</p>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4 bg-card">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5" /> {t("evaluation.fields.instructor")}
              </Label>
              {instructorSlot ?? (
                <Input disabled={headerDisabled} value={header?.instructorName ?? ""} readOnly={headerDisabled} placeholder={t("evaluation.placeholders.instructor")} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> {t("evaluation.fields.student")}
              </Label>
              {studentSlot ?? (
                <Input disabled={headerDisabled} value={header?.studentName ?? ""} readOnly={headerDisabled} placeholder={t("evaluation.placeholders.student")} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Plane className="h-3.5 w-3.5" /> {t("evaluation.fields.mission")}
              </Label>
              <Input disabled value={header?.missionName ?? ""} readOnly placeholder={t("evaluation.placeholders.mission")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" /> {t("evaluation.fields.missionTime")}
              </Label>
              <Input disabled value={header?.missionTime ?? ""} readOnly placeholder={t("evaluation.placeholders.missionTime")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" /> {t("evaluation.fields.evaluatedAt")}
              </Label>
              {evaluatedAtSlot ?? (
                <Input disabled={headerDisabled} value={header?.evaluatedAt ?? ""} readOnly={headerDisabled} placeholder={t("evaluation.placeholders.evaluatedAt")} />
              )}
            </div>
          </div>

          {visibilitySlot ? <div className="pt-1">{visibilitySlot}</div> : null}
        </div>
      </Card>



      {categories.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {t("evaluation.preview.empty")}
        </Card>
      )}

      {categories.map((category, catIndex) => (
        <Card key={category.id} className="overflow-hidden shadow-md">
          <div className="relative overflow-hidden bg-evaluation-banner px-5 py-4 flex items-center justify-between gap-3">
            <div className="relative z-10 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-evaluation-banner-muted">
                {t("evaluation.preview.categoryIndex", { index: catIndex + 1 })}
              </p>
              <h4 className="text-lg font-bold text-evaluation-banner-foreground break-words">
                {category.name.trim() || t("evaluation.preview.untitledCategory")}
              </h4>
              {category.description?.trim() && (
                <p className="text-xs text-evaluation-banner-muted break-words">{category.description}</p>
              )}
            </div>
            <div className="relative z-10 flex flex-col items-end shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-widest text-evaluation-banner-muted">
                {t("evaluation.preview.average")}
              </span>
              <span className="mt-0.5 rounded-full bg-evaluation-banner-accent px-3 py-1 text-sm font-bold text-evaluation-banner-foreground">
                {fmt(categoryAverages[category.id] ?? null)}
              </span>
            </div>
            <div className="pointer-events-none absolute -right-4 -bottom-6 h-24 w-24 rounded-full bg-evaluation-banner-accent opacity-40" />
          </div>

          <div className="space-y-3 bg-muted/30 p-3 sm:p-4">
            {category.subcategories.length === 0 && (
              <p className="px-1 py-2 text-sm text-muted-foreground">
                {t("evaluation.preview.noSubcategories")}
              </p>
            )}
            {category.subcategories.map((sub) => (
              <div
                key={sub.id}
                className="rounded-xl border bg-background p-4 space-y-3 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold break-words">
                      {sub.name.trim() || t("evaluation.preview.untitledSubcategory")}
                    </p>
                    {sub.description?.trim() && (
                      <p className="text-xs text-muted-foreground break-words">{sub.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {SCALE.map((value) => {
                      const active = scores[sub.id] === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setScore(sub.id, value)}
                          className={cn(
                            "h-8 w-8 rounded-lg border text-sm transition-all active:scale-95",
                            active
                              ? "bg-primary text-primary-foreground border-primary font-bold shadow-md"
                              : "bg-background text-muted-foreground border-border font-medium hover:bg-muted"
                          )}
                          aria-label={`${sub.name} – ${value}`}
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <AutoTextarea
                  value={comments[sub.id] ?? ""}
                  onChange={(e) => setComment(sub.id, e.target.value)}
                  placeholder={t("evaluation.placeholders.subComment")}
                  minHeight={56}
                  className="text-sm bg-muted/40"
                />

              </div>
            ))}
          </div>
        </Card>
      ))}


      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Label className="text-sm font-semibold">{t("evaluation.fields.overallComment")}</Label>
          <Badge className="whitespace-nowrap">
            {t("evaluation.preview.totalAverage")}: {fmt(overallAverage)}
          </Badge>
        </div>
        {overallAiSlot}
        <AutoTextarea
          value={overallComment}
          onChange={(e) => setOverall(e.target.value)}
          placeholder={t("evaluation.placeholders.overallComment")}
          minHeight={112}
          maxHeight={520}
        />

      </Card>

      {signatureSlot}
    </div>
  );
};

export default EvaluationFormPreview;
