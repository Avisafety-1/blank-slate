import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAuditKpis,
  fetchCompetencies,
  fetchFleet,
  fetchOperations,
  fetchSafety,
  fetchAuditDocuments,
  fetchAuditReviews,
  fetchDispositions,
  fetchOverdueAuditActions,
  fetchFindingsAwaitingVerification,
} from "../queries";
import { runScanner } from "../services/ComplianceScanner";
import { evaluateCompliance } from "../services/ComplianceEngine";
import { getAuditInsights } from "../services/AuditInsightService";
import { useCompanySettings } from "@/hooks/useCompanySettings";

const STALE = 30_000;

function baseArgs() {
  const { user, companyId } = useAuth();
  return { userId: user?.id, companyId: companyId ?? null, enabled: !!user?.id && !!companyId };
}

export function useAuditKpis() {
  const { userId, companyId, enabled } = baseArgs();
  return useQuery({
    queryKey: ["audit", "kpis", companyId],
    queryFn: () => fetchAuditKpis(userId!, companyId!),
    enabled,
    staleTime: STALE,
  });
}

export function useAuditCompetencies() {
  const { userId, companyId, enabled } = baseArgs();
  return useQuery({
    queryKey: ["audit", "competencies", companyId],
    queryFn: () => fetchCompetencies(userId!, companyId!),
    enabled,
    staleTime: STALE,
  });
}

export function useAuditFleet() {
  const { userId, companyId, enabled } = baseArgs();
  return useQuery({
    queryKey: ["audit", "fleet", companyId],
    queryFn: () => fetchFleet(userId!, companyId!),
    enabled,
    staleTime: STALE,
  });
}

export function useAuditOperations() {
  const { userId, companyId, enabled } = baseArgs();
  return useQuery({
    queryKey: ["audit", "operations", companyId],
    queryFn: () => fetchOperations(userId!, companyId!),
    enabled,
    staleTime: STALE,
  });
}

export function useAuditSafety() {
  const { userId, companyId, enabled } = baseArgs();
  return useQuery({
    queryKey: ["audit", "safety", companyId],
    queryFn: () => fetchSafety(userId!, companyId!),
    enabled,
    staleTime: STALE,
  });
}

export function useAuditDocuments() {
  const { userId, companyId, enabled } = baseArgs();
  return useQuery({
    queryKey: ["audit", "documents", companyId],
    queryFn: () => fetchAuditDocuments(userId!, companyId!),
    enabled,
    staleTime: STALE,
  });
}

export function useAuditReviews() {
  const { userId, companyId, enabled } = baseArgs();
  return useQuery({
    queryKey: ["audit", "reviews", companyId],
    queryFn: () => fetchAuditReviews(userId!, companyId!),
    enabled,
    staleTime: STALE,
  });
}

/** Combined data + engine + scanner for the Overview tab. */
export function useAuditOverview() {
  const { user, companyId } = useAuth();
  const settings = useCompanySettings();

  const enabled = !!user?.id && !!companyId;
  const q = useQueries({
    queries: [
      { queryKey: ["audit", "kpis", companyId], queryFn: () => fetchAuditKpis(user!.id, companyId!), enabled, staleTime: STALE },
      { queryKey: ["audit", "competencies", companyId], queryFn: () => fetchCompetencies(user!.id, companyId!), enabled, staleTime: STALE },
      { queryKey: ["audit", "documents", companyId], queryFn: () => fetchAuditDocuments(user!.id, companyId!), enabled, staleTime: STALE },
      { queryKey: ["audit", "fleet", companyId], queryFn: () => fetchFleet(user!.id, companyId!), enabled, staleTime: STALE },
      { queryKey: ["audit", "operations", companyId], queryFn: () => fetchOperations(user!.id, companyId!), enabled, staleTime: STALE },
      { queryKey: ["audit", "safety", companyId], queryFn: () => fetchSafety(user!.id, companyId!), enabled, staleTime: STALE },
      { queryKey: ["audit", "dispositions", companyId], queryFn: () => fetchDispositions(user!.id, companyId!), enabled, staleTime: STALE },
      { queryKey: ["audit", "overdueActions", companyId], queryFn: () => fetchOverdueAuditActions(user!.id, companyId!), enabled, staleTime: STALE },
      { queryKey: ["audit", "awaitingVerification", companyId], queryFn: () => fetchFindingsAwaitingVerification(user!.id, companyId!), enabled, staleTime: STALE },
    ],
  });

  const [kpis, competencies, documents, fleet, operations, safety, dispositions, overdue, awaiting] = q;
  const isLoading = q.some((x) => x.isLoading);
  const isError = q.some((x) => x.isError);
  const error = q.find((x) => x.isError)?.error as Error | undefined;

  const scannerFindings =
    !isLoading && !isError
      ? runScanner(
          {
            companyId: companyId!,
            competencies: competencies.data ?? [],
            documents: documents.data ?? [],
            fleet: fleet.data ?? [],
            operations: operations.data?.issues ?? [],
            safety: safety.data ?? null,
            overdueAuditActions: (overdue.data as any[]) ?? [],
            findingsAwaitingVerification: (awaiting.data as any[]) ?? [],
            requireSoraOnMissions: !!(settings as any)?.require_sora_on_missions,
          },
          (dispositions.data as any[]) ?? [],
        )
      : [];

  const evaluation = !isLoading && !isError
    ? evaluateCompliance({
        competencies: competencies.data ?? [],
        documents: documents.data ?? [],
        fleet: fleet.data ?? [],
        operations: operations.data?.issues ?? [],
        operationsTotal: operations.data?.total ?? 0,
        safety: safety.data ?? null,
        openAuditActions: kpis.data?.openActions ?? 0,
        overdueAuditActions: ((overdue.data as any[]) ?? []).length,
      })
    : null;

  const insights = getAuditInsights(scannerFindings, kpis.data);

  return {
    isLoading,
    isError,
    error,
    kpis: kpis.data,
    competencies: competencies.data ?? [],
    documents: documents.data ?? [],
    fleet: fleet.data ?? [],
    operationsIssues: operations.data?.issues ?? [],
    operationsTotal: operations.data?.total ?? 0,
    safety: safety.data,
    scannerFindings,
    evaluation,
    insights,
  };
}

// ---------- Mutations for audit_reviews CRUD ----------
export function useCreateAuditReview() {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; review_type?: string; review_date?: string }) => {
      const { data, error } = await supabase
        .from("audit_reviews")
        .insert({
          company_id: companyId!,
          title: input.title,
          review_type: input.review_type ?? "internal",
          review_date: input.review_date ?? new Date().toISOString().slice(0, 10),
          created_by: user?.id,
          responsible_user_id: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audit", "reviews", companyId] }),
  });
}

export function useUpdateAuditReview() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<{ title: string; status: string; override_reason: string; closed_at: string }> }) => {
      const { data, error } = await supabase
        .from("audit_reviews")
        .update(input.patch as any)
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audit", "reviews", companyId] }),
  });
}

export function useCreateAuditFinding() {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      review_id?: string | null;
      source_scanner_code?: string | null;
      category: string;
      description: string;
      severity?: "critical" | "warning" | "info";
      responsible_user_id?: string | null;
      deadline?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("audit_findings")
        .insert({
          company_id: companyId!,
          review_id: input.review_id ?? null,
          source_scanner_code: input.source_scanner_code ?? null,
          category: input.category,
          description: input.description,
          severity: input.severity ?? "warning",
          responsible_user_id: input.responsible_user_id ?? null,
          deadline: input.deadline ?? null,
          created_by: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audit", "reviews", companyId] }),
  });
}

export function useUpsertDisposition() {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      finding_code: string;
      entity_type: string;
      entity_id: string;
      disposition: "accepted" | "dismissed" | "snoozed";
      reason?: string;
      snooze_until?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("compliance_finding_dispositions")
        .upsert(
          {
            company_id: companyId!,
            finding_code: input.finding_code,
            entity_type: input.entity_type,
            entity_id: input.entity_id,
            disposition: input.disposition,
            reason: input.reason ?? null,
            snooze_until: input.snooze_until ?? null,
            created_by: user?.id,
          },
          { onConflict: "company_id,finding_code,entity_type,entity_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audit"] }),
  });
}
