import { supabase } from "@/integrations/supabase/client";

export type PropagationFlag =
  | "mission_roles"
  | "mission_types"
  | "flight_alerts"
  | "sora_config"
  | "sora_buffer_mode"
  | "default_map_layers";

/**
 * Returnerer selskapet vi faktisk skal lese innstillingen fra:
 * morselskapet hvis den aktuelle "gjelder for alle avdelinger"-bryteren er på,
 * ellers selskapet selv.
 */
export async function resolveEffectiveCompanyId(
  companyId: string | null | undefined,
  flag: PropagationFlag,
): Promise<string | null> {
  if (!companyId) return null;
  try {
    const { data } = await (supabase as any).rpc("get_propagating_parent_company_id", {
      _company_id: companyId,
      _flag: flag,
    });
    return (data as string | null) || companyId;
  } catch {
    return companyId;
  }
}
