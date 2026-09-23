import { supabase } from "@/integrations/supabase/client";

/** Technical specification fields a user can enter manually for a custom drone model. */
export interface CustomDroneModelSpecs {
  modell: string;
  klasse?: string;
  vekt?: string;
  payload?: string;
  merknader?: string;
  characteristic_dimension_m?: string;
  max_speed_mps?: string;
  max_wind_mps?: string;
  endurance_min?: string;
  ip_rating?: string;
  airframe_category?: string;
}

const num = (v?: string) => (v !== undefined && v !== "" && !isNaN(Number(v)) ? Number(v) : null);
const int = (v?: string) => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};
const txt = (v?: string) => (v && v.trim() !== "" ? v.trim() : null);

export interface UpsertCompanyDroneModelResult {
  id: string | null;
  error: string | null;
}

/** Escapes PostgREST ilike wildcards so model names match literally. */
const escapeLike = (v: string) => v.replace(/[%_]/g, (c) => `\\${c}`);

/**
 * Creates (or updates) a company-owned drone model in the catalog.
 * Company-owned models are only visible to the owning company and its departments (RLS).
 * `weight_kg`/`payload_kg` are NOT NULL in the catalog, so empty input falls back to 0.
 */
export async function upsertCompanyDroneModel(
  companyId: string,
  userId: string | null,
  specs: CustomDroneModelSpecs,
): Promise<UpsertCompanyDroneModelResult> {
  const name = specs.modell?.trim();
  if (!companyId || !name) return { id: null, error: null };

  const payload = {
    name,
    eu_class: specs.klasse || "",
    weight_kg: num(specs.vekt) ?? 0,
    payload_kg: num(specs.payload) ?? 0,
    comment: txt(specs.merknader),
    characteristic_dimension_m: num(specs.characteristic_dimension_m),
    max_speed_mps: num(specs.max_speed_mps),
    max_wind_mps: num(specs.max_wind_mps),
    endurance_min: int(specs.endurance_min),
    ip_rating: txt(specs.ip_rating),
    airframe_category: txt(specs.airframe_category),
    company_id: companyId,
  };

  const { data: existing } = await (supabase as any)
    .from("drone_models")
    .select("id")
    .eq("company_id", companyId)
    .ilike("name", escapeLike(name))
    .maybeSingle();

  if (existing?.id) {
    const { error } = await (supabase as any)
      .from("drone_models")
      .update(payload)
      .eq("id", existing.id);
    if (error) {
      console.error("Failed to update company drone model:", error);
      return { id: null, error: error.message ?? "update failed" };
    }
    return { id: existing.id as string, error: null };
  }

  const { data, error } = await (supabase as any)
    .from("drone_models")
    .insert([{ ...payload, created_by: userId }])
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create company drone model:", error);
    return { id: null, error: error.message ?? "insert failed" };
  }
  return { id: (data?.id as string) ?? null, error: null };
}

/**
 * Looks up a catalog model by name, preferring the company's own model over a global one.
 */
export async function fetchCatalogModelByName(modelName: string) {
  if (!modelName) return null;
  const { data } = await (supabase as any)
    .from("drone_models")
    .select("*")
    .ilike("name", modelName)
    .order("company_id", { ascending: false, nullsFirst: false })
    .limit(1);
  return (data && data[0]) || null;
}
