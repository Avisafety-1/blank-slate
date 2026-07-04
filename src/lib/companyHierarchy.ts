import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves the *root* company name for the given company id by walking the
 * hierarchy via the SQL helper `get_parent_company_id` (which returns the root
 * ancestor id, or NULL when the company is itself a root).
 *
 * Used by features that must be scoped to an entire company hierarchy — e.g.
 * the Tensio power-grid map layer, which should be visible to Tensio and all
 * of its sub-departments regardless of the department's own name.
 */
const rootNameCache = new Map<string, string | null>();

export async function resolveRootCompanyName(
  companyId: string | null | undefined,
): Promise<string | null> {
  if (!companyId) return null;
  if (rootNameCache.has(companyId)) return rootNameCache.get(companyId) ?? null;

  const { data: rootId } = await (supabase.rpc as any)("get_parent_company_id", {
    _company_id: companyId,
  });

  const targetId: string = (rootId as string | null) ?? companyId;
  const { data } = await supabase
    .from("companies")
    .select("name")
    .eq("id", targetId)
    .maybeSingle();

  const name = (data as any)?.name ?? null;
  rootNameCache.set(companyId, name);
  return name;
}
