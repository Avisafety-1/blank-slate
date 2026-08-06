import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Save, ClipboardCheck, ShieldCheck, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import EvaluationFormPreview from "@/components/evaluation/EvaluationFormPreview";
import EvaluationAiSummaryButton from "@/components/evaluation/EvaluationAiSummaryButton";

import { sendEvaluationNotification } from "@/lib/evaluationNotification";

import type { EvaluationTemplateLite, EvaluationResponseRow } from "@/hooks/useMissionEvaluation";


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mission: any;
  template: EvaluationTemplateLite;
  response: EvaluationResponseRow | null;
  onSaved?: () => void;
}

interface PersonOption {
  id: string;
  name: string;
  role: string | null;
}

const toLocalInput = (iso?: string | null) => {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const EvaluationResponseDialog = ({
  open,
  onOpenChange,
  mission,
  template,
  response,
  onSaved,
}: Props) => {
  const { t, i18n } = useTranslation();
  const { user, companyId } = useAuth();

  const [people, setPeople] = useState<PersonOption[]>([]);
  const [studentId, setStudentId] = useState<string>("");
  const [instructorId, setInstructorId] = useState<string>("");
  const [evaluatedAt, setEvaluatedAt] = useState<string>(toLocalInput());
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [overallComment, setOverallComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [me, setMe] = useState<PersonOption | null>(null);
  const [shareWithAdmins, setShareWithAdmins] = useState(true);
  const [extraViewerIds, setExtraViewerIds] = useState<string[]>([]);
  const [companyPeople, setCompanyPeople] = useState<PersonOption[]>([]);
  const [viewerSearch, setViewerSearch] = useState("");
  const [visibilityOpen, setVisibilityOpen] = useState(false);

  const locked = response?.status === "completed";

  useEffect(() => {
    if (!open) return;
    setScores(response?.scores ?? {});
    setComments(response?.comments ?? {});
    setOverallComment(response?.overall_comment ?? "");
    setStudentId(response?.student_id ?? "");
    setInstructorId(response?.instructor_id ?? "");
    setEvaluatedAt(toLocalInput(response?.evaluated_at ?? null));
    setShareWithAdmins(response?.share_with_admins ?? true);
    setExtraViewerIds(response?.extra_viewer_ids ?? []);
    setViewerSearch("");
  }, [open, response]);

  /** Everyone in the company (for the visibility picker) */
  useEffect(() => {
    if (!open) return;
    const cid = mission?.company_id || companyId;
    if (!cid) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("company_id", cid)
        .order("full_name", { ascending: true }) as any);
      if (cancelled) return;
      setCompanyPeople(
        (data || []).map((p: any) => ({
          id: p.id,
          name: p.full_name || p.email || "—",
          role: null,
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mission?.company_id, companyId]);


  useEffect(() => {
    if (!open || !mission?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase
        .from("mission_personnel")
        .select("profile_id, profiles:profile_id(full_name, email), company_mission_roles:role_id(name)")
        .eq("mission_id", mission.id) as any);
      if (cancelled) return;
      const map = new Map<string, PersonOption>();
      (data || [])
        .filter((row: any) => row.profile_id)
        .forEach((row: any) => {
          const existing = map.get(row.profile_id);
          const role = row.company_mission_roles?.name ?? null;
          if (existing) {
            if (role && !existing.role?.includes(role)) {
              existing.role = existing.role ? `${existing.role}, ${role}` : role;
            }
            return;
          }
          map.set(row.profile_id, {
            id: row.profile_id,
            name: row.profiles?.full_name || row.profiles?.email || "—",
            role,
          });
        });
      const options = Array.from(map.values());
      setPeople(options);
      setStudentId((prev) => {
        if (prev) return prev;
        const student = options.find(
          (p) =>
            (p.role || "").toLowerCase().includes("elev") ||
            (p.role || "").toLowerCase().includes("student")
        );
        return student?.id ?? "";
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mission?.id]);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setMe({
          id: user.id,
          name: (data as any)?.full_name || (data as any)?.email || user.email || "",
          role: null,
        });
        setInstructorId((prev) => prev || user.id);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  /** Mission personnel + current user (deduped) */
  const allPeople = useMemo(() => {
    const list = [...people];
    if (me && !list.some((p) => p.id === me.id)) list.unshift(me);
    return list;
  }, [people, me]);

  const missionTime = useMemo(() => {
    const raw = mission?.tidspunkt || mission?.start_time;
    if (!raw) return "";
    try {
      return new Date(raw).toLocaleString(i18n.language === "en" ? "en-GB" : "nb-NO");
    } catch {
      return "";
    }
  }, [mission, i18n.language]);

  const overallAverage = useMemo(() => {
    const catAverages = template.structure.map((cat) => {
      const values = cat.subcategories
        .map((s) => scores[s.id])
        .filter((v): v is number => typeof v === "number" && v > 0);
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    });
    const valid = catAverages.filter((v): v is number => typeof v === "number");
    return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  }, [template.structure, scores]);

  const studentName =
    allPeople.find((p) => p.id === studentId)?.name ?? response?.student_name ?? "";
  const instructorName =
    allPeople.find((p) => p.id === instructorId)?.name ?? response?.instructor_name ?? "";

  const save = async (status: "draft" | "completed") => {
    if (!user) return;
    setSaving(true);
    try {
      const payload: any = {
        template_id: template.id,
        company_id: mission?.company_id || companyId,
        mission_id: mission?.id ?? null,
        mission_name: mission?.tittel ?? null,
        mission_start: mission?.tidspunkt ?? null,
        mission_end: mission?.slutt_tidspunkt ?? null,
        instructor_id: instructorId || user.id,
        instructor_name: instructorName,
        student_id: studentId || null,
        student_name: studentName || null,
        scores,
        comments,
        overall_comment: overallComment.trim() || null,
        overall_average: overallAverage,
        status,
        share_with_admins: shareWithAdmins,
        extra_viewer_ids: extraViewerIds,
        evaluated_at: evaluatedAt
          ? new Date(evaluatedAt).toISOString()
          : new Date().toISOString(),
      };


      let savedId = response?.id ?? null;
      const wasCompleted = response?.status === "completed";

      if (response?.id) {
        const { error } = await supabase
          .from("evaluation_responses")
          .update(payload)
          .eq("id", response.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase
          .from("evaluation_responses")
          .insert({ ...payload, created_by: user.id })
          .select("id")
          .maybeSingle();
        if (error) throw error;
        savedId = (inserted as any)?.id ?? null;
      }

      // Varsle eleven i innboksen når evalueringen fullføres
      if (status === "completed" && !wasCompleted && savedId && studentId) {
        await sendEvaluationNotification({
          responseId: savedId,
          studentId,
          senderId: user.id,
          missionTitle: mission?.tittel ?? response?.mission_id ?? null,
        });
      }

      toast.success(
        status === "draft"
          ? t("evaluation.mission.draftSaved")
          : t("evaluation.mission.saved")
      );
      onSaved?.();

      onOpenChange(false);
    } catch (err: any) {
      console.error("Error saving evaluation:", err);
      toast.error(err?.message ?? t("evaluation.mission.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const personSelect = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string
  ) => (
    <Select value={value || undefined} onValueChange={onChange} disabled={locked}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        position="popper"
        sideOffset={4}
        className="z-[1300] bg-popover border shadow-lg max-h-60"
      >
        {allPeople.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">
            {t("evaluation.mission.noPersonnel", "Ingen personell funnet")}
          </div>
        ) : (
          allPeople.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
              {p.role ? ` (${p.role})` : ""}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>

  );

  const filteredCompanyPeople = companyPeople.filter((p) =>
    p.name.toLowerCase().includes(viewerSearch.trim().toLowerCase())
  );

  const currentViewers = [
    instructorName || t("evaluation.visibility.instructor"),
    ...(response?.status === "completed" || locked
      ? [studentName || t("evaluation.visibility.student")]
      : []),
    ...(shareWithAdmins ? [t("evaluation.visibility.admins")] : []),
    ...extraViewerIds
      .map((id) => companyPeople.find((p) => p.id === id)?.name)
      .filter(Boolean as any as (v: string | undefined) => v is string),
  ];

  const visibilityBox = (
    <Collapsible
      open={visibilityOpen}
      onOpenChange={setVisibilityOpen}
      className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10 overflow-hidden"
    >
      <CollapsibleTrigger className="w-full flex items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-amber-100/60 dark:hover:bg-amber-500/15">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-lg bg-amber-100 dark:bg-amber-500/20 p-1.5 shrink-0">
            <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              {t("evaluation.visibility.title")}
            </h4>
            <p className="text-xs text-amber-900/70 dark:text-amber-200/70 truncate">
              {t("evaluation.visibility.seenBy")}: {currentViewers.join(", ")}
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 transition-transform ${visibilityOpen ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up overflow-hidden">
        <div className="border-t border-amber-200/70 dark:border-amber-500/30 p-4 space-y-3">
          <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
            {t("evaluation.visibility.description")}
          </p>

          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="eval-share-admins" className="text-sm">
              {t("evaluation.visibility.shareWithAdmins")}
            </Label>
            <Switch
              id="eval-share-admins"
              checked={shareWithAdmins}
              onCheckedChange={setShareWithAdmins}
              disabled={locked}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">{t("evaluation.visibility.otherViewers")}</Label>
            <Input
              value={viewerSearch}
              onChange={(e) => setViewerSearch(e.target.value)}
              placeholder={t("common.search")}
              disabled={locked}
              className="h-8"
            />
            <div className="max-h-40 overflow-y-auto rounded-md border bg-background/70 divide-y">
              {filteredCompanyPeople.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  {t("evaluation.visibility.noPeople")}
                </p>
              ) : (
                filteredCompanyPeople.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={extraViewerIds.includes(p.id)}
                      disabled={locked}
                      onCheckedChange={(checked) =>
                        setExtraViewerIds((prev) =>
                          checked ? [...new Set([...prev, p.id])] : prev.filter((id) => id !== p.id)
                        )
                      }
                    />
                    <span className="truncate">{p.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] sm:max-w-3xl max-h-[92vh] flex flex-col p-4 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            <span className="break-words">{template.title}</span>
            {response?.status && (
              <Badge variant={locked ? "default" : "secondary"} className="ml-auto shrink-0">
                {locked ? t("evaluation.mission.statusCompleted") : t("evaluation.mission.statusDraft")}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 space-y-4">
          <div className={locked ? "pointer-events-none opacity-90" : undefined}>
            <EvaluationFormPreview
              title={template.title}
              description={template.description ?? ""}
              categories={template.structure}
              header={{
                instructorName,
                studentName,
                missionName: mission?.tittel ?? "",
                missionTime,
              }}
              headerDisabled={false}
              instructorSlot={personSelect(
                instructorId,
                setInstructorId,
                t("evaluation.mission.selectInstructor")
              )}
              studentSlot={personSelect(
                studentId,
                setStudentId,
                t("evaluation.mission.selectStudent")
              )}
              visibilitySlot={visibilityBox}
              evaluatedAtSlot={

                <Input
                  type="datetime-local"
                  value={evaluatedAt}
                  onChange={(e) => setEvaluatedAt(e.target.value)}
                  disabled={locked}
                />
              }
              overallAiSlot={
                locked ? undefined : (
                  <EvaluationAiSummaryButton
                    templateTitle={template.title}
                    categories={template.structure}
                    scores={scores}
                    comments={comments}
                    overallAverage={overallAverage}
                    currentText={overallComment}
                    onGenerated={setOverallComment}
                  />
                )
              }
              scores={scores}

              comments={comments}
              overallComment={overallComment}
              onScoreChange={(subId, value) =>
                setScores((prev) => ({ ...prev, [subId]: prev[subId] === value ? 0 : value }))
              }
              onCommentChange={(subId, value) =>
                setComments((prev) => ({ ...prev, [subId]: value }))
              }
              onOverallCommentChange={setOverallComment}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            {t("common.cancel")}
          </Button>
          {!locked && (
            <>
              <Button
                variant="secondary"
                onClick={() => save("draft")}
                disabled={saving}
                className="w-full sm:w-auto"
              >
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                {t("evaluation.mission.saveDraft")}
              </Button>
              <Button onClick={() => save("completed")} disabled={saving} className="w-full sm:w-auto">
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ClipboardCheck className="h-4 w-4 mr-1" />}
                {t("common.save")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EvaluationResponseDialog;
