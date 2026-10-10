import { useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAuditPersons } from "../queries";
import type { AuditTemplateKey, ChecklistResult } from "../lib/auditTemplates";
import { selectMyAuditTasks, type AuditTask } from "../lib/auditTasks";

const db = supabase as any;

export interface ChecklistItemRow {
  id: string; section_id: string; item_key: string | null; label: string; reference: string | null;
  result: ChecklistResult; comment: string | null; order_index: number;
}
export interface SectionRow {
  id: string; review_id: string; section_key: string; status: string; order_index: number;
  audit_checklist_items: ChecklistItemRow[];
}
export interface ActionRow {
  id: string; finding_id: string; description: string; responsible_user_id: string | null;
  deadline: string | null; status: "open" | "in_progress" | "closed"; comment: string | null;
  closed_at: string | null; closed_by: string | null; created_by?: string | null;
}
export interface FindingRow {
  id: string; review_id: string | null; company_id: string; category: string; description: string;
  reference: string | null; responsible_user_id: string | null; deadline: string | null;
  severity: "critical" | "warning" | "info"; status: "open" | "in_progress" | "verified" | "closed";
  verified_by: string | null; verified_at: string | null; audit_actions: ActionRow[];
  checklist_item_id: string | null; closure_comment: string | null; self_verified: boolean;
  root_cause?: string | null; created_by?: string | null;
}
export interface ReviewRow {
  id: string; company_id: string; audited_company_id: string; title: string; review_date: string;
  responsible_user_id: string | null; status: "planned" | "in_progress" | "closed"; template_key: AuditTemplateKey;
  override_reason: string | null; reopen_reason: string | null; closed_at: string | null;
  audit_sections: SectionRow[]; audit_findings: FindingRow[];
}

export function useAuditPersons() {
  const { user, companyId } = useAuth();
  return useQuery({
    queryKey: ["audit", "persons", companyId],
    queryFn: () => fetchAuditPersons(user!.id, companyId!),
    enabled: !!user?.id && !!companyId,
    staleTime: 5 * 60_000,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    for (const k of ["reviews", "kpis", "awaitingVerification", "overdueActions", "myTasks", "taskFinding"]) {
      qc.invalidateQueries({ queryKey: ["audit", k] });
    }
  };
}

// ---- Save status shared by all internal-audit mutations ----
export interface SaveStatus { pending: number; savedAt: Date | null; error: boolean }
let saveState: SaveStatus = { pending: 0, savedAt: null, error: false };
const saveListeners = new Set<() => void>();
const inflight = new Set<Promise<unknown>>();
const setSave = (patch: Partial<SaveStatus>) => {
  saveState = { ...saveState, ...patch };
  saveListeners.forEach((l) => l());
};
export function trackSave<R>(p: Promise<R>): Promise<R> {
  setSave({ pending: saveState.pending + 1 });
  inflight.add(p);
  p.then(
    () => setSave({ pending: saveState.pending - 1, savedAt: new Date(), error: false }),
    () => setSave({ pending: saveState.pending - 1, error: true }),
  ).finally(() => inflight.delete(p));
  return p;
}
export function waitForSaves(): Promise<unknown> {
  return Promise.allSettled([...inflight]);
}
export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore(
    (l) => { saveListeners.add(l); return () => { saveListeners.delete(l); }; },
    () => saveState,
  );
}

function useDbMutation<T, R = unknown>(fn: (input: T) => Promise<R>) {
  const invalidate = useInvalidate();
  const m = useMutation({ mutationFn: fn, onSuccess: invalidate, onError: invalidate });
  return { ...m, mutateAsync: (input: T) => trackSave(m.mutateAsync(input)) };
}

const check = ({ error }: { error: any }) => { if (error) throw error; };

export type AuditNotifyEvent = "assigned" | "ready_for_verification" | "verified";
/** Fire-and-forget: the server derives recipients from state. A failure never rolls back the save. */
export function notifyAudit(event: AuditNotifyEvent, findingId: string, actionId?: string | null) {
  void supabase.functions.invoke("audit-notify", { body: { event, findingId, actionId: actionId ?? null } })
    .then(({ error }) => { if (error) console.warn("[audit-notify]", error); })
    .catch((e) => console.warn("[audit-notify]", e));
}

export function useInternalAuditMutations() {
  return {
    createReview: useDbMutation(async (i: {
      title: string; review_date: string; responsible_user_id: string | null;
      template_key: AuditTemplateKey; audited_company_id: string | null; sections: unknown;
    }) => {
      const { data, error } = await db.rpc("create_internal_audit", {
        _title: i.title, _review_date: i.review_date, _responsible_user_id: i.responsible_user_id,
        _template_key: i.template_key, _audited_company_id: i.audited_company_id, _sections: i.sections,
      });
      if (error) throw error;
      return data as string;
    }),
    updateReview: useDbMutation(async (i: { id: string; patch: Record<string, unknown> }) =>
      check(await db.from("audit_reviews").update(i.patch).eq("id", i.id))),
    deleteReview: useDbMutation(async (id: string) => check(await db.from("audit_reviews").delete().eq("id", id))),
    updateItem: useDbMutation(async (i: { id: string; patch: Record<string, unknown>; sectionId?: string; sectionStatus?: string }) => {
      check(await db.from("audit_checklist_items").update(i.patch).eq("id", i.id));
      if (i.sectionId && i.sectionStatus) {
        check(await db.from("audit_sections").update({ status: i.sectionStatus }).eq("id", i.sectionId));
      }
    }),
    createFinding: useDbMutation(async (i: {
      review: ReviewRow; category: string; description: string; reference?: string | null; severity?: FindingRow["severity"];
      responsible_user_id?: string | null; deadline?: string | null; checklist_item_id?: string | null;
    }) => {
      const { data, error } = await db.from("audit_findings").insert({
        review_id: i.review.id, company_id: i.review.audited_company_id, category: i.category,
        description: i.description, reference: i.reference ?? null, severity: i.severity ?? "warning",
        responsible_user_id: i.responsible_user_id ?? null, deadline: i.deadline ?? null,
        checklist_item_id: i.checklist_item_id ?? null,
      }).select("id").single();
      if (error) throw error;
      if (i.responsible_user_id) notifyAudit("assigned", data.id);
      return data.id as string;
    }),
    updateFinding: useDbMutation(async (i: { id: string; patch: Record<string, unknown> }) => {
      check(await db.from("audit_findings").update(i.patch).eq("id", i.id));
      if (i.patch.responsible_user_id) notifyAudit("assigned", i.id);
      if (i.patch.status === "verified") notifyAudit("verified", i.id);
    }),
    deleteFinding: useDbMutation(async (id: string) => check(await db.from("audit_findings").delete().eq("id", id))),
    createAction: useDbMutation(async (i: {
      finding: Pick<FindingRow, "id" | "company_id" | "responsible_user_id" | "deadline">; description: string;
      responsible_user_id?: string | null; deadline?: string | null;
    }) => {
      const responsible = i.responsible_user_id !== undefined ? i.responsible_user_id : i.finding.responsible_user_id;
      const { data, error } = await db.from("audit_actions").insert({
        finding_id: i.finding.id, company_id: i.finding.company_id, description: i.description,
        responsible_user_id: responsible,
        deadline: i.deadline !== undefined ? i.deadline : i.finding.deadline,
      }).select("id").single();
      if (error) throw error;
      if (responsible) notifyAudit("assigned", i.finding.id, data.id);
    }),
    updateAction: useDbMutation(async (i: { id: string; findingId?: string; patch: Record<string, unknown> }) => {
      const { data, error } = await db.from("audit_actions").update(i.patch).eq("id", i.id).select("finding_id").maybeSingle();
      if (error) throw error;
      const findingId = i.findingId ?? data?.finding_id;
      if (!findingId) return;
      if (i.patch.responsible_user_id) notifyAudit("assigned", findingId, i.id);
      if (i.patch.status === "closed") notifyAudit("ready_for_verification", findingId);
    }),
    deleteAction: useDbMutation(async (id: string) => check(await db.from("audit_actions").delete().eq("id", id))),
  };
}

// ---- "Mine revisjonsoppgaver" ----
export function useMyAuditTasks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["audit", "myTasks", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<AuditTask[]> => {
      const uid = user!.id;
      const [f, a] = await Promise.all([
        db.from("audit_findings").select("id, description, severity, deadline, status, responsible_user_id, audit_reviews(title)")
          .eq("responsible_user_id", uid).in("status", ["open", "in_progress"]).limit(500),
        db.from("audit_actions").select("id, finding_id, description, deadline, status, responsible_user_id, audit_findings(severity, status, audit_reviews(title))")
          .eq("responsible_user_id", uid).neq("status", "closed").limit(500),
      ]);
      if (f.error) throw f.error;
      if (a.error) throw a.error;
      return selectMyAuditTasks(
        (f.data ?? []).map((r: any) => ({ ...r, reviewTitle: r.audit_reviews?.title ?? null })),
        (a.data ?? []).map((r: any) => ({
          ...r, findingSeverity: r.audit_findings?.severity ?? "warning", findingStatus: r.audit_findings?.status ?? "open",
          reviewTitle: r.audit_findings?.audit_reviews?.title ?? null,
        })),
        uid,
      );
    },
  });
}

export interface TaskFindingRow extends FindingRow {
  audit_reviews: { title: string; audited_company_id: string; company_id: string; responsible_user_id: string | null; status: string } | null;
  audit_checklist_items: { label: string; item_key: string | null; reference: string | null } | null;
  unitName: string | null;
}

export function useAuditTaskFinding(findingId: string | null) {
  return useQuery({
    queryKey: ["audit", "taskFinding", findingId],
    enabled: !!findingId,
    queryFn: async (): Promise<TaskFindingRow | null> => {
      const { data, error } = await db.from("audit_findings")
        .select("*, audit_actions(*), audit_reviews(title, audited_company_id, company_id, responsible_user_id, status), audit_checklist_items(label, item_key, reference)")
        .eq("id", findingId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      let unitName: string | null = null;
      const cid = data.audit_reviews?.audited_company_id;
      if (cid) {
        const { data: c } = await db.from("companies").select("navn").eq("id", cid).maybeSingle();
        unitName = c?.navn ?? null;
      }
      return { ...data, unitName } as TaskFindingRow;
    },
  });
}
