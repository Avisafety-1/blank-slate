import { supabase } from "@/integrations/supabase/client";
import type { ScannerFinding } from "../types";

export interface RecipientSuggestion {
  id: string;
  full_name: string | null;
  email: string | null;
  reason: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function profilesByIds(ids: (string | null | undefined)[], reason: string): Promise<RecipientSuggestion[]> {
  const clean = [...new Set(ids.filter((x): x is string => !!x && UUID.test(x)))];
  if (!clean.length) return [];
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", clean);
  return (data ?? []).map((p) => ({ ...p, reason }));
}

/**
 * Suggest recipients for a finding:
 * - competency     -> the person
 * - drone          -> drones.technical_responsible_id; fallback technical responsibles in the drone's company
 * - mission/flight -> pilot(s) on the mission/flight; fallback creator
 * - incident       -> oppfolgingsansvarlig_id; fallback reporter
 * fallback: admins in the entity's own company (department), not the viewer's.
 */
export async function resolveRecipients(
  finding: ScannerFinding,
  companyId: string,
): Promise<RecipientSuggestion[]> {
  let suggestions: RecipientSuggestion[] = [];
  let entityCompanyId: string = companyId;
  const ev = (finding.evidence ?? {}) as Record<string, unknown>;

  try {
    if (finding.entityType === "competency" || finding.entityType === "profile" || finding.categoryKey === "competence") {
      const profileId = (ev.profileId as string | undefined) ?? finding.entityId;
      suggestions = await profilesByIds([profileId], "pilot");
    } else if (finding.entityType === "drone") {
      const { data: drone } = await supabase
        .from("drones")
        .select("id, company_id, technical_responsible_id")
        .eq("id", finding.entityId)
        .maybeSingle();
      if (drone?.company_id) entityCompanyId = drone.company_id;
      suggestions = await profilesByIds([drone?.technical_responsible_id], "technical");
      if (!suggestions.length) {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("company_id", entityCompanyId)
          .eq("is_technical_responsible", true);
        suggestions = (data ?? []).map((p) => ({ ...p, reason: "technical" }));
      }
    } else if (finding.entityType === "active_flight") {
      const { data } = await supabase
        .from("active_flights")
        .select("id, profile_id, company_id, mission_id")
        .eq("id", finding.entityId)
        .maybeSingle();
      if (data?.company_id) entityCompanyId = data.company_id;
      suggestions = await profilesByIds([data?.profile_id], "pilot");
      if (!suggestions.length && data?.mission_id) {
        const { data: m } = await supabase.from("missions").select("user_id").eq("id", data.mission_id).maybeSingle();
        suggestions = await profilesByIds([m?.user_id], "owner");
      }
    } else if (finding.entityType === "mission") {
      const [{ data: m }, { data: personnel }] = await Promise.all([
        supabase.from("missions").select("id, user_id, company_id").eq("id", finding.entityId).maybeSingle(),
        supabase.from("mission_personnel").select("profile_id").eq("mission_id", finding.entityId),
      ]);
      if (m?.company_id) entityCompanyId = m.company_id;
      suggestions = await profilesByIds((personnel ?? []).map((p) => p.profile_id), "pilot");
      if (!suggestions.length) suggestions = await profilesByIds([m?.user_id], "owner");
    } else if (finding.entityType === "incident") {
      const { data: inc } = await supabase
        .from("incidents")
        .select("id, company_id, oppfolgingsansvarlig_id, rapportert_av, user_id")
        .eq("id", finding.entityId)
        .maybeSingle();
      if (inc?.company_id) entityCompanyId = inc.company_id;
      suggestions = await profilesByIds([inc?.oppfolgingsansvarlig_id], "responsible");
      if (!suggestions.length) suggestions = await profilesByIds([inc?.rapportert_av, inc?.user_id], "reporter");
    }
  } catch (e) {
    console.warn("[resolveRecipients] failed", e);
  }

  // Fallback: admins in the entity's own company
  if (suggestions.length === 0) {
    const { data: people } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("company_id", entityCompanyId);
    const ids = (people ?? []).map((p) => p.id);
    if (ids.length) {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", ids)
        .in("role", ["admin", "administrator"]);
      const adminIds = new Set((roleRows ?? []).map((r) => r.user_id));
      suggestions = (people ?? []).filter((p) => adminIds.has(p.id)).map((p) => ({ ...p, reason: "admin" }));
    }
  }

  return suggestions;
}
