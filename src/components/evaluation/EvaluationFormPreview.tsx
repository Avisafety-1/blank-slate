import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
      <Card className="p-4 space-y-4 bg-card/80">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold break-words">
              {title.trim() || t("evaluation.untitled")}
            </h3>
            {description?.trim() && (
              <p className="text-sm text-muted-foreground break-words">{description}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5" /> {t("evaluation.fields.instructor")}
            </Label>
            {instructorSlot ?? (
              <Input disabled={headerDisabled} value={header?.instructorName ?? ""} readOnly={headerDisabled} placeholder={t("evaluation.placeholders.instructor")} />
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> {t("evaluation.fields.student")}
            </Label>
            {studentSlot ?? (
              <Input disabled={headerDisabled} value={header?.studentName ?? ""} readOnly={headerDisabled} placeholder={t("evaluation.placeholders.student")} />
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Plane className="h-3.5 w-3.5" /> {t("evaluation.fields.mission")}
            </Label>
            <Input disabled value={header?.missionName ?? ""} readOnly placeholder={t("evaluation.placeholders.mission")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" /> {t("evaluation.fields.missionTime")}
            </Label>
            <Input disabled value={header?.missionTime ?? ""} readOnly placeholder={t("evaluation.placeholders.missionTime")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" /> {t("evaluation.fields.evaluatedAt")}
            </Label>
            {evaluatedAtSlot ?? (
              <Input disabled={headerDisabled} value={header?.evaluatedAt ?? ""} readOnly={headerDisabled} placeholder={t("evaluation.placeholders.evaluatedAt")} />
            )}
          </div>
        </div>

      </Card>

      {categories.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {t("evaluation.preview.empty")}
        </Card>
      )}

      {categories.map((category, catIndex) => (
        <Card key={category.id} className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 bg-muted/50 px-4 py-3 border-b">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {t("evaluation.preview.categoryIndex", { index: catIndex + 1 })}
              </p>
              <h4 className="font-semibold break-words">
                {category.name.trim() || t("evaluation.preview.untitledCategory")}
              </h4>
              {category.description?.trim() && (
                <p className="text-xs text-muted-foreground break-words">{category.description}</p>
              )}
            </div>
            <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
              {t("evaluation.preview.average")}: {fmt(categoryAverages[category.id] ?? null)}
            </Badge>
          </div>

          <div className="divide-y">
            {category.subcategories.length === 0 && (
              <p className="px-4 py-4 text-sm text-muted-foreground">
                {t("evaluation.preview.noSubcategories")}
              </p>
            )}
            {category.subcategories.map((sub) => (
              <div key={sub.id} className="px-4 py-3 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">
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
                            "h-8 w-8 rounded-md border text-sm font-medium transition-colors",
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-muted-foreground hover:bg-muted"
                          )}
                          aria-label={`${sub.name} – ${value}`}
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Textarea
                  value={comments[sub.id] ?? ""}
                  onChange={(e) => setComment(sub.id, e.target.value)}
                  placeholder={t("evaluation.placeholders.subComment")}
                  rows={2}
                  className="text-sm"
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
        <Textarea
          value={overallComment}
          onChange={(e) => setOverall(e.target.value)}
          placeholder={t("evaluation.placeholders.overallComment")}
          rows={4}
        />
      </Card>
    </div>
  );
};

export default EvaluationFormPreview;
