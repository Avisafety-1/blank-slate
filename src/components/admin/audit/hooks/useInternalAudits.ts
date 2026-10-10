import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAuditPersons } from "../queries";
import type { AuditTemplateKey, ChecklistResult } from "../lib/auditTemplates";

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
  closed_at: string | null; closed_by: string | null;
}
export interface FindingRow {
  id: string; review_id: string | null; company_id: string; category: string; description: string;
  reference: string | null; responsible_user_id: string | null; deadline: string | null;
  severity: "critical" | "warning" | "info"; status: "open" | "in_progress" | "verified" | "closed";
  verified_by: string | null; verified_at: string | null; audit_actions: ActionRow[];
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
    for (const k of ["reviews", "kpis", "awaitingVerification", "overdueActions"]) {
      qc.invalidateQueries({ queryKey: ["audit", k] });
    }
  };
}

function useDbMutation<T>(fn: (input: T) => Promise<unknown>) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: fn, onSuccess: invalidate, onError: invalidate });
}

const check = ({ error }: { error: any }) => { if (error) throw error; };

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
    }) => check(await db.from("audit_findings").insert({
      review_id: i.review.id, company_id: i.review.audited_company_id, category: i.category,
      description: i.description, reference: i.reference ?? null, severity: i.severity ?? "warning",
    }))),
    updateFinding: useDbMutation(async (i: { id: string; patch: Record<string, unknown> }) =>
      check(await db.from("audit_findings").update(i.patch).eq("id", i.id))),
    deleteFinding: useDbMutation(async (id: string) => check(await db.from("audit_findings").delete().eq("id", id))),
    createAction: useDbMutation(async (i: { finding: FindingRow; description: string }) =>
      check(await db.from("audit_actions").insert({ finding_id: i.finding.id, company_id: i.finding.company_id, description: i.description }))),
    updateAction: useDbMutation(async (i: { id: string; patch: Record<string, unknown> }) =>
      check(await db.from("audit_actions").update(i.patch).eq("id", i.id))),
    deleteAction: useDbMutation(async (id: string) => check(await db.from("audit_actions").delete().eq("id", id))),
  };
}
