import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Save, ClipboardCheck, ShieldCheck } from "lucide-react";
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
        evaluated_at: evaluatedAt
          ? new Date(evaluatedAt).toISOString()
          : new Date().toISOString(),
      };

      if (response?.id) {
        const { error } = await supabase
          .from("evaluation_responses")
          .update(payload)
          .eq("id", response.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("evaluation_responses")
          .insert({ ...payload, created_by: user.id });
        if (error) throw error;
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
              evaluatedAtSlot={
                <Input
                  type="datetime-local"
                  value={evaluatedAt}
                  onChange={(e) => setEvaluatedAt(e.target.value)}
                  disabled={locked}
                />
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
