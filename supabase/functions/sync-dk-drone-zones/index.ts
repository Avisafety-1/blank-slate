// Sync Trafikstyrelsen (Denmark) drone zones + nature areas into dk_drone_zones / dk_nature_areas.
// Scheduled daily via pg_cron, also callable manually by superadmin.
//
// Fase A2: non-blocking dual-write to public.airspace_zones. Any failure in the
// dual-write path is caught and logged; it never affects the existing sync.
import { createClient } from "npm:@supabase/supabase-js@2.81.0";
import {
  AuthError,
  authErrorResponse,
  requireCronOrSuperadmin,
} from "../_shared/auth.ts";
import { safeFetch } from "../_shared/http.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_HOSTS = ["trafikstyrelsen.maps.arcgis.com"];

const DRONE_ZONES_URL =
  "https://trafikstyrelsen.maps.arcgis.com/sharing/rest/content/items/980697acd04d4a9bb1fd34bbefab924a/data";
const NATURE_URL =
  "https://trafikstyrelsen.maps.arcgis.com/sharing/rest/content/items/ff657943724944faaf19807380f5e24a/data";

// Trafikstyrelsen "Farve" code → our layer_id
// 1 = rød (flyvesikringskritisk), 4 = orange (opmærksomhed), 5 = blå (sikringskritisk)
const FARVE_TO_LAYER: Record<string, string> = {
  "1": "rod",
  "4": "orange",
  "5": "bla",
};

// Fase A6: mapping fra Trafikstyrelsen-farve til felles airspace_zones-klasser
// og til UI-kartlag. Trafikstyrelsen er nasjonal CAA → høy autoritet (rank 20).
// Konservativ restriction_type: aldri "PROHIBITED" basert på farve alene.
const FARVE_TO_UNIFIED: Record<string, {
  layer_id: string;
  zone_type: string;
  restriction_type: string;
  display_class: string;
}> = {
  // Rød: flyvesikringskritisk (flyplasser, heliporter, 5 km-soner)
  "1": { layer_id: "rpas",                zone_type: "DRONE_NO_FLY",           restriction_type: "APPROVAL_REQUIRED", display_class: "RED"   },
  // Orange: opmærksomhed (fareområder)
  "4": { layer_id: "fareomrader",         zone_type: "DRONE_DANGER",           restriction_type: "CAUTION",           display_class: "AMBER" },
  // Blå: sikringskritisk (fængsler, ambassader, kraftværker)
  "5": { layer_id: "sikringsobjekter",    zone_type: "DRONE_PROTECTED_OBJECT", restriction_type: "NOTIFICATION",      display_class: "BLUE"  },
};

const DK_AUTHORITY_RANK = 20; // Nasjonal CAA


const UNIFIED_BATCH_SIZE = 500;
const UNIFIED_MAX_SKIPPED_RATIO = 0.1; // avbryt deaktivering hvis >10 % feilet

function geomTypeToKind(t: string): "point" | "polygon" | null {
  if (t === "Point" || t === "MultiPoint") return "point";
  if (t === "Polygon" || t === "MultiPolygon") return "polygon";
  return null;
}

function normalizeDroneFeature(f: any, idx: number) {
  if (!f?.geometry || !f.properties) return null;
  const p = f.properties;
  const farve = String(p.Farve ?? "").trim();
  const layer_id = FARVE_TO_LAYER[farve];
  if (!layer_id) return null;
  const kind = geomTypeToKind(f.geometry.type);
  if (!kind) return null;

  const external_id = String(p.OBJECTID ?? p.objectid ?? `${farve}-${idx}`);
  const name = p.title ?? p.Title ?? p.navn ?? null;

  return {
    layer_id,
    geometry_type: kind,
    external_id,
    name,
    category: p.typeId ?? null,
    buffer: p.Bufferzone ?? null,
    icao: p.ICAO ?? null,
    elevation_m: p.Elevation_meter ?? null,
    lower_limit_m: null,
    upper_limit_m: null,
    geometry_geojson: JSON.stringify(f.geometry),
    properties: p,
    _raw_geometry: f.geometry,
    _farve: farve,
  };
}

function normalizeNatureFeature(f: any, idx: number) {
  if (!f?.geometry || !f.properties) return null;
  const p = f.properties;
  const external_id = String(p.OBJECTID ?? p.Fnr ?? `nat-${idx}`);
  const name = p["Fuglebeskyttelsesområder_og_Hab"] ?? p.Fnr ?? null;
  const aktiv = String(p.Aktiv ?? "").trim().toUpperCase();
  const active = aktiv !== "NEJ" && aktiv !== "NO" && aktiv !== "INAKTIV";

  return {
    external_id,
    theme: p.Temanavn ?? null,
    name,
    restriction_period: p["Restriktionsperiode_"] ?? null,
    reason: p["Årsag__"] ?? null,
    active,
    source_url: p.URL ?? null,
    geometry_geojson: JSON.stringify(f.geometry),
    properties: p,
    _raw_geometry: f.geometry,
  };
}

// ---------- Fase A2: dual-write helpers ----------

async function startSyncRun(supabase: any, source: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("airspace_sync_runs")
      .insert({ source, country_code: "DK", status: "running" })
      .select("id")
      .single();
    if (error) {
      console.warn(`[dual-write] failed to start sync run for ${source}:`, error.message);
      return null;
    }
    return data.id;
  } catch (err) {
    console.warn(`[dual-write] startSyncRun threw for ${source}:`, err);
    return null;
  }
}

async function finishSyncRun(
  supabase: any,
  runId: string | null,
  patch: Record<string, unknown>,
) {
  if (!runId) return;
  try {
    await supabase
      .from("airspace_sync_runs")
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq("id", runId);
  } catch (err) {
    console.warn(`[dual-write] finishSyncRun threw:`, err);
  }
}

async function upsertUnifiedInBatches(
  supabase: any,
  features: any[],
): Promise<{ upserted: number; skipped: number; errors: unknown[]; batchFailures: number }> {
  let upserted = 0;
  let skipped = 0;
  const errors: unknown[] = [];
  let batchFailures = 0;

  for (let i = 0; i < features.length; i += UNIFIED_BATCH_SIZE) {
    const batch = features.slice(i, i + UNIFIED_BATCH_SIZE);
    try {
      const { data, error } = await supabase.rpc("bulk_upsert_airspace_zones", {
        p_features: batch,
      });
      if (error) {
        batchFailures += 1;
        errors.push({ batch_start: i, error: error.message });
        continue;
      }
      const res = (data ?? {}) as any;
      upserted += Number(res.upserted ?? 0);
      skipped += Number(res.skipped ?? 0);
      if (Array.isArray(res.errors) && res.errors.length) {
        errors.push(...res.errors.slice(0, 5));
      }
    } catch (err) {
      batchFailures += 1;
      errors.push({ batch_start: i, error: String(err) });
    }
  }

  return { upserted, skipped, errors, batchFailures };
}

// Danish drone zones → felles airspace_zones-format
function buildUnifiedDroneFeatures(features: any[]) {
  const out: any[] = [];
  for (const f of features) {
    const mapping = FARVE_TO_UNIFIED[f._farve];
    if (!mapping) continue;
    // dedupe_key lar OpenAIP eller andre kilder senere skjules automatisk
    // hvis de beskriver samme fysiske objekt (ICAO for flyplasser, ellers navn).
    const dedupeKey = f.icao
      ? `airport:${String(f.icao).toUpperCase()}`
      : (f.name ? `dk:${mapping.layer_id}:${String(f.name).toLowerCase().trim()}` : null);
    out.push({
      country_code: "DK",
      source: "trafikstyrelsen_dk",
      external_id: f.external_id,
      layer_id: mapping.layer_id,
      zone_type: mapping.zone_type,
      restriction_type: mapping.restriction_type,
      display_class: mapping.display_class,
      theme: f.category ?? null,
      name: f.name ?? f.external_id,
      short_name: null,
      authority: "Trafikstyrelsen",
      lower_limit_m: null,
      upper_limit_m: f.elevation_m != null ? Math.round(Number(f.elevation_m)) : null,
      lower_limit_raw: null,
      upper_limit_raw: f.elevation_m != null ? String(f.elevation_m) : null,
      altitude_reference: null,
      valid_from: null,
      valid_to: null,
      active: true,
      authority_rank: DK_AUTHORITY_RANK,
      dedupe_key: dedupeKey,
      properties: { ...(f.properties ?? {}), raw_type: f._farve, adapter_version: "a6" },
      geometry: JSON.stringify(f._raw_geometry),
    });
  }
  return out;
}


function buildUnifiedNatureFeatures(features: any[]) {
  const out: any[] = [];
  for (const f of features) {
    out.push({
      country_code: "DK",
      source: "trafikstyrelsen_dk_nature",
      external_id: f.external_id,
      layer_id: "verneomrader",
      zone_type: "NATURE",
      restriction_type: "NATURE_SENSITIVE",
      display_class: "GREEN",
      theme: f.theme ?? null,
      name: f.name ?? f.external_id,
      short_name: null,
      authority: "Trafikstyrelsen",
      lower_limit_m: null,
      upper_limit_m: null,
      lower_limit_raw: null,
      upper_limit_raw: null,
      altitude_reference: null,
      valid_from: null,
      valid_to: null,
      active: !!f.active,
      authority_rank: DK_AUTHORITY_RANK,
      dedupe_key: f.external_id ? `dk:nature:${f.external_id}` : null,
      properties: { ...(f.properties ?? {}), raw_type: "nature", adapter_version: "a6" },
      geometry: JSON.stringify(f._raw_geometry),
    });
  }
  return out;
}


async function dualWriteUnified(
  supabase: any,
  source: string,
  unifiedFeatures: any[],
): Promise<Record<string, unknown>> {
  const runId = await startSyncRun(supabase, source);
  const fetched = unifiedFeatures.length;

  if (fetched === 0) {
    await finishSyncRun(supabase, runId, {
      status: "aborted",
      fetched_count: 0, valid_count: 0,
      error: "no_features_after_normalization",
    });
    return { ok: false, reason: "no_features", fetched: 0 };
  }

  const { upserted, skipped, errors, batchFailures } =
    await upsertUnifiedInBatches(supabase, unifiedFeatures);

  const failureRatio = fetched > 0 ? (skipped + batchFailures) / fetched : 1;
  const shouldDeactivate = batchFailures === 0 && failureRatio <= UNIFIED_MAX_SKIPPED_RATIO;

  let deactivateResult: unknown = { skipped: true, reason: "not_run" };
  if (shouldDeactivate) {
    const keepIds = unifiedFeatures.map((f) => f.external_id).filter(Boolean);
    try {
      const { data, error } = await supabase.rpc("deactivate_stale_airspace_zones", {
        p_source: source,
        p_country_code: "DK",
        p_keep_external_ids: keepIds,
      });
      deactivateResult = error ? { error: error.message } : data;
    } catch (err) {
      deactivateResult = { error: String(err) };
    }
  } else {
    deactivateResult = {
      skipped: true,
      reason: batchFailures > 0 ? "batch_failures" : "high_skipped_ratio",
      failure_ratio: failureRatio,
    };
  }

  const status = batchFailures > 0 ? "failed" : "success";
  const deactivated =
    typeof (deactivateResult as any)?.deactivated === "number"
      ? (deactivateResult as any).deactivated
      : 0;

  await finishSyncRun(supabase, runId, {
    status,
    fetched_count: fetched,
    valid_count: fetched - skipped,
    upserted_count: upserted,
    deactivated_count: deactivated,
    error: errors.length ? JSON.stringify(errors).slice(0, 2000) : null,
    stats: { batch_failures: batchFailures, deactivate: deactivateResult },
  });

  return {
    ok: batchFailures === 0,
    fetched, upserted, skipped, batch_failures: batchFailures,
    deactivate: deactivateResult,
    errors: errors.slice(0, 5),
  };
}

async function syncDroneZones(supabase: any) {
  const res = await safeFetch(`${DRONE_ZONES_URL}?v=${Date.now()}`, {
    headers: { "User-Agent": "Avisafe-Sync/1.0" },
  }, ALLOWED_HOSTS);
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const json = await res.json();
  const features: any[] = Array.isArray(json?.features) ? json.features : [];

  // Group by layer_id so bulk_upsert_dk_drone_zones can delete stale rows per layer
  const byLayer: Record<string, any[]> = { rod: [], orange: [], bla: [] };
  const allNormalized: any[] = [];
  features.forEach((f, i) => {
    const n = normalizeDroneFeature(f, i);
    if (n) {
      byLayer[n.layer_id].push(n);
      allNormalized.push(n);
    }
  });

  const layerResults: Record<string, unknown> = {};
  for (const [layer_id, feats] of Object.entries(byLayer)) {
    const { data, error } = await supabase.rpc("bulk_upsert_dk_drone_zones", {
      p_layer_id: layer_id,
      p_features: feats,
    });
    layerResults[layer_id] = error ? { ok: false, error: error.message } : { ok: true, fetched: feats.length, ...(data ?? {}) };
  }

  // Fase A2: non-blocking dual-write
  let unified: unknown = { skipped: true };
  try {
    const unifiedFeatures = buildUnifiedDroneFeatures(allNormalized);
    unified = await dualWriteUnified(supabase, "trafikstyrelsen_dk", unifiedFeatures);
  } catch (err) {
    console.warn("[dual-write] drone zones dual-write failed non-fatally:", err);
    unified = { ok: false, error: String(err) };
  }

  return { ok: true, total: features.length, layers: layerResults, unified };
}

async function syncNatureAreas(supabase: any) {
  const res = await safeFetch(`${NATURE_URL}?v=${Date.now()}`, {
    headers: { "User-Agent": "Avisafe-Sync/1.0" },
  }, ALLOWED_HOSTS);
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const json = await res.json();
  const features: any[] = Array.isArray(json?.features) ? json.features : [];
  const normalized = features
    .map((f, i) => normalizeNatureFeature(f, i))
    .filter(Boolean) as any[];

  const { data, error } = await supabase.rpc("bulk_upsert_dk_nature_areas", {
    p_features: normalized,
  });
  const legacy = error
    ? { ok: false, error: error.message }
    : { ok: true, fetched: features.length, ...(data ?? {}) };

  // Fase A2: non-blocking dual-write
  let unified: unknown = { skipped: true };
  try {
    const unifiedFeatures = buildUnifiedNatureFeatures(normalized);
    unified = await dualWriteUnified(supabase, "trafikstyrelsen_dk_nature", unifiedFeatures);
  } catch (err) {
    console.warn("[dual-write] nature areas dual-write failed non-fatally:", err);
    unified = { ok: false, error: String(err) };
  }

  return { ...legacy, unified };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireCronOrSuperadmin(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [droneRes, natureRes] = await Promise.all([
      syncDroneZones(supabase),
      syncNatureAreas(supabase),
    ]);

    return new Response(
      JSON.stringify({ ok: true, drone_zones: droneRes, nature_areas: natureRes, synced_at: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders);
    console.error("sync-dk-drone-zones failed:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
