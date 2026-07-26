import { supabase } from "@/integrations/supabase/client";
import type { ScannerFinding } from "../types";

export interface RecipientSuggestion {
  id: string;
  full_name: string | null;
  email: string | null;
  reason: string;
}

/**
 * Suggest a responsible recipient for a finding based on the entity involved.
 * - competency  -> the profile itself (pilot)
 * - drone/service -> company technical responsible(s)
 * - flightNotClosed / mission* -> mission owner / pilot
 * fallback: company admins
 */
export async function resolveRecipients(
  finding: ScannerFinding,
  companyId: string,
): Promise<RecipientSuggestion[]> {
  const suggestions: RecipientSuggestion[] = [];

  try {
    if (finding.entityType === "profile" || finding.categoryKey === "competence") {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", finding.entityId)
        .maybeSingle();
      if (data) suggestions.push({ ...data, reason: "pilot" });
    } else if (finding.entityType === "drone") {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("company_id", companyId)
        .eq("is_technical_responsible", true);
      (data ?? []).forEach((p) => suggestions.push({ ...p, reason: "technical" }));
    } else if (finding.entityType === "mission" || finding.entityType === "active_flight") {
      const table = finding.entityType === "active_flight" ? "active_flights" : "missions";
      const col = finding.entityType === "active_flight" ? "profile_id" : "created_by";
      const { data } = await supabase
        .from(table as "missions")
        .select(`id, ${col}`)
        .eq("id", finding.entityId)
        .maybeSingle();
      const ownerId = (data as Record<string, unknown> | null)?.[col] as string | undefined;
      if (ownerId) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("id", ownerId)
          .maybeSingle();
        if (prof) suggestions.push({ ...prof, reason: "owner" });
      }
    }
  } catch (e) {
    console.warn("[resolveRecipients] failed", e);
  }

  // Fallback: company admins
  if (suggestions.length === 0) {
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("user_id, role");
    const adminIds = (roleRows ?? [])
      .filter((r) => ["admin", "superadmin"].includes(String(r.role)))
      .map((r) => r.user_id);
    if (adminIds.length) {
      const { data: admins } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", adminIds)
        .eq("company_id", companyId);
      (admins ?? []).forEach((a) => suggestions.push({ ...a, reason: "admin" }));
    }
  }

  return suggestions;
}
