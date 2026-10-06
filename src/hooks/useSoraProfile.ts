import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  checkSoraProfileConsistency,
  sanitizeSoraProfile,
  type ConsistencyIssue,
  type SoraProfile,
} from "@/lib/soraProfile";

export type SoraProfileStatus = "none" | "draft" | "confirmed" | "outdated";

export interface SoraProfileRow {
  id: string;
  company_id: string;
  document_id: string;
  source_file_url: string | null;
  status: "draft" | "confirmed";
  profile: SoraProfile;
  consistency: ConsistencyIssue[] | null;
  extraction_source: "ai" | "manual" | null;
  extracted_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  updated_at: string;
}

export interface SoraExtractResult {
  readable: boolean;
  reason?: string;
  profile?: SoraProfile;
  consistency?: ConsistencyIssue[];
}

export const soraProfileKey = (documentId: string | null | undefined) => ["sora-profile", documentId];

export const deriveSoraProfileStatus = (
  row: { status: string; source_file_url: string | null } | null | undefined,
  currentFileUrl: string | null | undefined,
): SoraProfileStatus => {
  if (!row) return "none";
  if ((row.source_file_url ?? null) !== (currentFileUrl ?? null)) return "outdated";
  return row.status === "confirmed" ? "confirmed" : "draft";
};

/** Load, save and confirm the SORA profile of one document. Writes are admin-only (RLS enforced). */
export function useSoraProfile(documentId: string | null | undefined) {
  const { user, companyId, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: soraProfileKey(documentId),
    enabled: !!documentId,
    staleTime: 30_000,
    queryFn: async () => {
      const [docRes, rowRes] = await Promise.all([
        supabase.from("documents").select("id, tittel, fil_url, fil_navn, company_id").eq("id", documentId!).maybeSingle(),
        (supabase.from("sora_document_profiles" as any).select("*").eq("document_id", documentId!).maybeSingle() as any),
      ]);
      const raw = rowRes.data as any;
      const row: SoraProfileRow | null = raw ? { ...raw, profile: sanitizeSoraProfile(raw.profile) } : null;
      let confirmerName: string | null = null;
      if (row?.confirmed_by) {
        const { data } = await supabase.from("profiles").select("full_name").eq("id", row.confirmed_by).maybeSingle();
        confirmerName = (data as any)?.full_name ?? null;
      }
      return { document: docRes.data as any, row, confirmerName };
    },
  });

  const document = query.data?.document ?? null;
  const row = query.data?.row ?? null;
  const status = deriveSoraProfileStatus(row, document?.fil_url);
  const canEdit = !!isAdmin && !!document && document.company_id === companyId;
  const isPdf = /\.pdf$/i.test(document?.fil_url || "");

  const save = useCallback(
    async (profile: SoraProfile, opts: { confirm: boolean; extractionSource: "ai" | "manual" | null; extractedAt?: string | null }) => {
      if (!documentId || !document || !companyId || !user) throw new Error("Not ready");
      const clean = sanitizeSoraProfile(profile);
      const now = new Date().toISOString();
      const payload = {
        company_id: document.company_id,
        document_id: documentId,
        source_file_url: document.fil_url ?? null,
        status: opts.confirm ? "confirmed" : "draft",
        profile: clean,
        consistency: checkSoraProfileConsistency(clean),
        extraction_source: opts.extractionSource,
        extracted_at: opts.extractedAt ?? row?.extracted_at ?? null,
        confirmed_by: opts.confirm ? user.id : null,
        confirmed_at: opts.confirm ? now : null,
      };
      const { error } = await (supabase.from("sora_document_profiles" as any)
        .upsert(payload, { onConflict: "document_id" }) as any);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: soraProfileKey(documentId) });
      await queryClient.invalidateQueries({ queryKey: ["sora-profile-list"] });
    },
    [documentId, document, companyId, user, row, queryClient],
  );

  const extract = useCallback(async (): Promise<SoraExtractResult> => {
    if (!documentId) throw new Error("No document");
    const { data, error } = await supabase.functions.invoke("extract-sora-profile", { body: { documentId } });
    if (error) {
      let message = error.message;
      try { message = (await (error as any).context?.json())?.error || message; } catch { /* keep message */ }
      throw new Error(message);
    }
    return {
      ...data,
      profile: data?.profile ? sanitizeSoraProfile(data.profile) : undefined,
    } as SoraExtractResult;
  }, [documentId]);

  return {
    loading: query.isLoading,
    document,
    row,
    status,
    canEdit,
    isPdf,
    confirmerName: query.data?.confirmerName ?? null,
    save,
    extract,
    reload: query.refetch,
  };
}

/** IDs of documents used as SORA on a mission type or mission visible to the caller. */
export function useSoraDocumentIds() {
  return useQuery({
    queryKey: ["sora-document-ids"],
    staleTime: 60_000,
    queryFn: async () => {
      const [types, missions, profiles] = await Promise.all([
        supabase.from("company_mission_types").select("sora_document_id").not("sora_document_id", "is", null),
        supabase.from("missions").select("sora_document_id").not("sora_document_id", "is", null).limit(1000),
        (supabase.from("sora_document_profiles" as any).select("document_id") as any),
      ]);
      const ids = new Set<string>();
      for (const r of (types.data as any[]) || []) ids.add(r.sora_document_id);
      for (const r of (missions.data as any[]) || []) ids.add(r.sora_document_id);
      for (const r of (profiles.data as any[]) || []) ids.add(r.document_id);
      return ids;
    },
  });
}
