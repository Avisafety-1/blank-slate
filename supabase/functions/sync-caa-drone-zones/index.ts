// Sync drone zone layers from dronesoner.no (Luftfartstilsynet) into caa_drone_zones table.
// Schedules via pg_cron daily, also callable manually by superadmin.
import { createClient } from "npm:@supabase/supabase-js@2.81.0";
import {
  AuthError,
  authErrorResponse,
  requireCronOrSuperadmin,
} from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface LayerSpec {
  id: string;
  url: string;
  authority_name: string;
  authority_url: string;
  authority_phone?: string;
  default_restriction: string;
  default_reason: string[];
  /** Optional: derive a canonical external_id (e.g. "ENR102") from feature properties. */
  externalIdFn?: (p: Record<string, unknown>) => string | null;
}

const LAYERS: LayerSpec[] = [
  {
    id: "fengsler",
    url: "https://dronesoner.no/data/forbud_fengsler.geojson",
    authority_name: "Kriminalomsorgen",
    authority_url: "https://www.kriminalomsorgen.no/finn-fengsel.237612.no.html",
    default_restriction: "REQ_AUTHORISATION",
    default_reason: ["SENSITIVE"],
  },
  {
    id: "ambassader",
    url: "https://dronesoner.no/data/forbud_ambassader.geojson",
    authority_name: "Politiet / NSM",
    authority_url: "https://nsm.no",
    default_restriction: "REQ_AUTHORISATION",
    default_reason: ["SENSITIVE"],
  },
  {
    id: "fareomrader",
    url: "https://dronesoner.no/data/obs_fareomrader.geojson",
    authority_name: "Luftfartstilsynet",
    authority_url: "https://luftfartstilsynet.no",
    default_restriction: "CONDITIONAL",
    default_reason: ["AIR_TRAFFIC"],
  },
  {
    id: "flyplasser",
    url: "https://dronesoner.no/data/obs_flyplasser.geojson",
    authority_name: "Avinor / Lufthavnoperatør",
    authority_url: "https://avinor.no",
    default_restriction: "CONDITIONAL",
    default_reason: ["AIR_TRAFFIC"],
  },
  {
    id: "notam_soner",
    url: "https://dronesoner.no/data/obs_notam_soner.geojson",
    authority_name: "Luftfartstilsynet",
    authority_url: "https://ippc.no",
    default_restriction: "CONDITIONAL",
    default_reason: ["AIR_TRAFFIC"],
  {
    id: "restriksjoner",
    url: "https://dronesoner.no/data/forbud_restriksjoner.geojson",
    authority_name: "Luftfartstilsynet",
    authority_url: "https://luftfartstilsynet.no",
    default_restriction: "PROHIBITED",
    default_reason: ["AIR_TRAFFIC"],
    // navn like "R102 Oslo sentrum" → canonical NOTAM-friendly id "ENR102"
    externalIdFn: (p) => {
      const navn = String((p as any).navn ?? (p as any).Navn ?? "");
      const m = navn.match(/\bR\s?(\d{2,4})/i);
      return m ? `ENR${m[1]}` : null;
    },
  },
];
  if (raw == null) return null;
  if (typeof raw === "number") return raw;
  const s = String(raw).trim().toUpperCase();
  if (!s || s === "GND" || s === "SFC") return 0;
  const m = s.match(/(\d+)\s*(FT|M)?/);
  if (!m) return null;
  const v = Number(m[1]);
  const unit = m[2] || "FT";
  return unit === "M" ? v : Math.round(v * 0.3048);
}

function altRef(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).toUpperCase();
  if (s.includes("AMSL")) return "AMSL";
  if (s.includes("AGL") || s.includes("GND") || s.includes("SFC")) return "AGL";
  return null;
}

function normalizeFeature(
  feature: any,
  spec: LayerSpec,
  index: number,
): Record<string, unknown> | null {
  if (!feature?.geometry) return null;
  const p = feature.properties ?? {};
  const icao = p.icaoKode && p.icaoKode !== "XXXX" ? p.icaoKode : null;
  const nameKey = p.navn ?? p.Navn ?? p.name ?? p.Name ?? p["name:nb"] ?? p["name:en"] ?? `idx-${index}`;
  const baseId =
    p.id ??
    p["@id"] ??
    p.identifier ??
    icao ??
    `${spec.id}-${nameKey}-${index}`;
  const externalId = baseId;
  const name = p.navn ?? p.Navn ?? p.name ?? p.Name ?? p["name:nb"] ?? p["name:en"] ?? null;
  const message = p.info ?? p.remarks ?? null;

  return {
    external_id: String(externalId).slice(0, 200),
    name,
    restriction: spec.default_restriction,
    reason: spec.default_reason,
    message,
    authority_name: spec.authority_name,
    authority_url: spec.authority_url,
    authority_phone: spec.authority_phone ?? null,
    lower_limit_m: parseAltitudeMeters(p.lower_limit),
    upper_limit_m: parseAltitudeMeters(p.upper_limit),
    lower_ref: altRef(p.lower_limit),
    upper_ref: altRef(p.upper_limit),
    geometry_geojson: JSON.stringify(feature.geometry),
    properties: p,
  };
}

async function syncLayer(supabase: any, spec: LayerSpec) {
  const url = `${spec.url}?v=${Date.now()}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Avisafe-Sync/1.0" },
  });
  if (!res.ok) {
    return { layer: spec.id, ok: false, error: `HTTP ${res.status}` };
  }
  const json = await res.json();
  const features: any[] = Array.isArray(json?.features) ? json.features : [];
  const normalized = features
    .map((f, i) => normalizeFeature(f, spec, i))
    .filter(Boolean);

  // Chunk to avoid huge JSON payloads
  const chunkSize = 200;
  let agg = { success: 0, error: 0, skipped: 0, deleted: 0 };
  for (let i = 0; i < normalized.length; i += chunkSize) {
    const chunk = normalized.slice(i, i + chunkSize);
    // Last chunk: pass full set instead via a single call so deletion works correctly
    // — workaround: do bulk in one call (most layers are small enough).
  }
  // Single bulk call (deletion needs full set in one batch)
  const { data, error } = await supabase.rpc("bulk_upsert_caa_zones", {
    p_layer_id: spec.id,
    p_features: normalized,
  });
  if (error) {
    return { layer: spec.id, ok: false, error: error.message };
  }
  return { layer: spec.id, ok: true, fetched: features.length, ...(data ?? {}) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    await requireCronOrSuperadmin(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const results = await Promise.all(LAYERS.map((s) => syncLayer(supabase, s)));

    return new Response(
      JSON.stringify({ ok: true, results, synced_at: new Date().toISOString() }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders);
    console.error("sync-caa-drone-zones failed:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
