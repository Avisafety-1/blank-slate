// Fase B1: Sync svenske dronesoner (LFV Dronechart WFS) inn i unified airspace_zones.
// Ingen legacy-tabell for Sverige. Går direkte i felles schema med authority_rank = 20.
// LFV data er OGC WFS / GeoJSON, oppdateres på AIRAC-syklus.
// CC BY-NC-ND 4.0 — kilde: https://daim.lfv.se/echarts/dronechart/API/
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

const ALLOWED_HOSTS = ["daim.lfv.se"];
const WFS_BASE = "https://daim.lfv.se/geoserver/wfs";
const SE_AUTHORITY_RANK = 20; // LFV / Transportstyrelsen ~ nasjonal CAA

const UNIFIED_BATCH_SIZE = 500;
const UNIFIED_MAX_SKIPPED_RATIO = 0.1;

// Mapping WFS-lag → felles airspace_zones-klasse. Samme layer_id-verdier som
// Norge og Danmark → én UI-knapp styrer alle tre land automatisk.
type LayerMapping = {
  layer_id: string;
  zone_type: string;
  restriction_type: string;
  display_class: string;
  // WFS CQL_FILTER for å begrense til drone-relevante høyder.
  cql_filter?: string;
};

const LFV_LAYERS: Array<{ typename: string; mapping: LayerMapping; source: string }> = [
  {
    typename: "mais:CTR",
    source: "lfv_se_ctr",
    mapping: { layer_id: "airspace", zone_type: "CTR", restriction_type: "APPROVAL_REQUIRED", display_class: "AMBER" },
  },
  {
    typename: "mais:TIZ",
    source: "lfv_se_tiz",
    mapping: { layer_id: "airspace", zone_type: "TIZ", restriction_type: "APPROVAL_REQUIRED", display_class: "AMBER" },
  },
  {
    typename: "mais:ATZ",
    source: "lfv_se_atz",
    mapping: { layer_id: "airspace", zone_type: "ATZ", restriction_type: "APPROVAL_REQUIRED", display_class: "AMBER" },
  },
  {
    typename: "DAIM_TOPO:RWY5K",
    source: "lfv_se_rwy5k",
    mapping: { layer_id: "rpas", zone_type: "DRONE_NO_FLY", restriction_type: "APPROVAL_REQUIRED", display_class: "RED" },
  },
  {
    typename: "DAIM_TOPO:HKP1K",
    source: "lfv_se_hkp1k",
    mapping: { layer_id: "rpas", zone_type: "DRONE_NO_FLY", restriction_type: "APPROVAL_REQUIRED", display_class: "RED" },
  },
  {
    typename: "mais:RSTA",
    source: "lfv_se_rsta",
    mapping: { layer_id: "restriksjonsomrader", zone_type: "R", restriction_type: "PROHIBITED", display_class: "RED" },
    // LFV publiserer kun GND-restriksjoner som drone-relevante.
    cql_filter: "LOWER='GND' OR LOWER='SFC'",
  },
  {
    typename: "mais:DNGA",
    source: "lfv_se_dnga",
    mapping: { layer_id: "fareomrader", zone_type: "D", restriction_type: "CAUTION", display_class: "AMBER" },
    // Spec: kun LOWER='GND' publiseres på Drönarkartan.
    cql_filter: "LOWER='GND'",
  },
  {
    // AIP Supplement: tidsbegrensede restriksjonsområder. Spec sier LOWER <= 500 ft.
    // Vi henter alt og filtrerer normaliserings-siden basert på LOW_UOM/LOWER.
    typename: "DAIM_TOPO:SUP",
    source: "lfv_se_sup",
    mapping: { layer_id: "restriksjonsomrader", zone_type: "R", restriction_type: "PROHIBITED", display_class: "RED" },
  },
];

// SUP-lag: konverter LOW_UOM/UP_UOM til meter. FT AMSL / FT AGL / M / FL.
function parseSupAltitude(value: string | null, uom: string | null): number | null {
  if (!value) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const u = (uom ?? "").toUpperCase();
  if (u === "M") return Math.round(num);
  if (u === "FT") return Math.round(num * 0.3048);
  if (u === "FL") return Math.round(num * 100 * 0.3048);
  return null;
}

function toStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function normalizeDedupeKey(mapping: LayerMapping, p: Record<string, unknown>, name: string | null): string | null {
  // Prioriter ICAO-koder for flyplass/CTR-relaterte lag så OpenAIP eller andre kilder
  // skjules automatisk hvis de senere legges til med lavere authority_rank.
  const icao =
    toStringOrNull(p["POSITIONINDICATOR"]) ??
    toStringOrNull(p["POSITIONIN"]);
  if (icao && (mapping.layer_id === "ctr" || mapping.layer_id === "rpas")) {
    return `airport:${icao.toUpperCase()}:${mapping.zone_type.toLowerCase()}`;
  }
  if (name) {
    return `se:${mapping.layer_id}:${name.toLowerCase().trim()}`;
  }
  return null;
}

function buildUnifiedFeatures(
  features: any[],
  mapping: LayerMapping,
  source: string,
): { rows: any[]; skipped: number } {
  const rows: any[] = [];
  let skipped = 0;
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    if (!f?.geometry) { skipped++; continue; }
    const p = (f.properties ?? {}) as Record<string, unknown>;

    const isSup = source === "lfv_se_sup";
    const externalId =
      toStringOrNull(f.id) ??
      toStringOrNull(p["OBJECTID"]) ??
      toStringOrNull(p["FID"]) ??
      toStringOrNull(p["DESIG"]) ??
      `${source}:${i}`;
    const name =
      toStringOrNull(p["NAMEOFAREA"]) ??
      toStringOrNull(p["NAME"]) ??
      toStringOrNull(p["LOCATION"]) ??
      toStringOrNull(p["NAMEOFPOIN"]) ??
      null;
    const upperRaw = toStringOrNull(p["UPPER"]);
    const lowerRaw = toStringOrNull(p["LOWER"]);
    const upperUom = toStringOrNull(p["UP_UOM"]);
    const lowerUom = toStringOrNull(p["LOW_UOM"]);

    let lowerM: number | null = null;
    let upperM: number | null = null;
    let altRef: string | null = null;

    if (isSup) {
      lowerM = parseSupAltitude(lowerRaw, lowerUom);
      upperM = parseSupAltitude(upperRaw, upperUom);
      // Filter: kun drone-relevante lave områder (LOWER <= 500 ft ≈ 152 m).
      if (lowerM !== null && lowerM > 152) { skipped++; continue; }
      altRef = upperUom === "FL" ? "FL" : (upperUom === "FT" ? "AMSL_FT" : (upperUom === "M" ? "M" : null));
    } else {
      // UPPER kan være 'UNL', 'FL95', tall (ft AMSL). Vi lagrer rå-verdien
      // og lar meter-feltet stå null når parsing ikke er trygg.
      if (upperRaw && /^\d+$/.test(upperRaw)) {
        upperM = Math.round(Number(upperRaw) * 0.3048);
      }
      altRef = upperRaw && /^FL/.test(upperRaw) ? "FL" : (upperRaw ? "AMSL_FT" : null);
    }

    const validFrom = isSup ? toStringOrNull(p["FROM"]) : null;
    const validTo = isSup ? toStringOrNull(p["TO"]) : null;

    rows.push({
      country_code: "SE",
      source,
      external_id: externalId,
      layer_id: mapping.layer_id,
      zone_type: mapping.zone_type,
      restriction_type: mapping.restriction_type,
      display_class: mapping.display_class,
      theme: toStringOrNull(p["TYPEOFAREA"]) ?? toStringOrNull(p["TYPEOFPOIN"]) ?? (isSup ? toStringOrNull(p["DESIG"]) : null),
      name: name ?? externalId,
      short_name: toStringOrNull(p["POSITIONINDICATOR"]) ?? toStringOrNull(p["POSITIONIN"]) ?? (isSup ? toStringOrNull(p["DESIG"]) : null),
      authority: "LFV",
      lower_limit_m: lowerM,
      upper_limit_m: upperM,
      lower_limit_raw: lowerRaw,
      upper_limit_raw: upperRaw,
      altitude_reference: altRef,
      valid_from: validFrom,
      valid_to: validTo,
      active: true,
      authority_rank: SE_AUTHORITY_RANK,
      dedupe_key: normalizeDedupeKey(mapping, p, name),
      properties: { ...p, raw_source_layer: source, adapter_version: "b1" },
      geometry: JSON.stringify(f.geometry),
    });
  }
  return { rows, skipped };
}

async function fetchLfvLayer(typename: string, cqlFilter?: string): Promise<any[]> {
  const params = new URLSearchParams({
    service: "WFS",
    version: "1.1.0",
    request: "GetFeature",
    typename,
    outputFormat: "application/json",
    srsname: "EPSG:4326",
  });
  if (cqlFilter) params.set("CQL_FILTER", cqlFilter);
  const url = `${WFS_BASE}?${params.toString()}`;
  const res = await safeFetch(url, {
    headers: { "User-Agent": "Avisafe-Sync/1.0", "Accept": "application/json" },
  }, ALLOWED_HOSTS);
  if (!res.ok) throw new Error(`LFV ${typename} HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.features) ? json.features : [];
}

async function startSyncRun(supabase: any, source: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("airspace_sync_runs")
      .insert({ source, country_code: "SE", status: "running" })
      .select("id")
      .single();
    if (error) { console.warn(`[se-sync] startSyncRun ${source}:`, error.message); return null; }
    return data.id;
  } catch (err) {
    console.warn(`[se-sync] startSyncRun threw ${source}:`, err);
    return null;
  }
}

async function finishSyncRun(supabase: any, runId: string | null, patch: Record<string, unknown>) {
  if (!runId) return;
  try {
    await supabase.from("airspace_sync_runs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", runId);
  } catch (err) {
    console.warn("[se-sync] finishSyncRun threw:", err);
  }
}

async function upsertInBatches(
  supabase: any,
  rows: any[],
): Promise<{ upserted: number; skipped: number; errors: unknown[]; batchFailures: number }> {
  let upserted = 0, skipped = 0, batchFailures = 0;
  const errors: unknown[] = [];
  for (let i = 0; i < rows.length; i += UNIFIED_BATCH_SIZE) {
    const batch = rows.slice(i, i + UNIFIED_BATCH_SIZE);
    try {
      const { data, error } = await supabase.rpc("bulk_upsert_airspace_zones", { p_features: batch });
      if (error) { batchFailures++; errors.push({ batch_start: i, error: error.message }); continue; }
      const res = (data ?? {}) as any;
      upserted += Number(res.upserted ?? 0);
      skipped += Number(res.skipped ?? 0);
      if (Array.isArray(res.errors) && res.errors.length) errors.push(...res.errors.slice(0, 5));
    } catch (err) {
      batchFailures++;
      errors.push({ batch_start: i, error: String(err) });
    }
  }
  return { upserted, skipped, errors, batchFailures };
}

async function syncOneLayer(
  supabase: any,
  entry: { typename: string; mapping: LayerMapping; source: string },
): Promise<Record<string, unknown>> {
  const runId = await startSyncRun(supabase, entry.source);
  let features: any[] = [];
  try {
    features = await fetchLfvLayer(entry.typename, entry.mapping.cql_filter);
  } catch (err) {
    await finishSyncRun(supabase, runId, { status: "failed", error: String(err).slice(0, 500) });
    return { ok: false, source: entry.source, error: String(err) };
  }

  const { rows, skipped: normalizeSkipped } = buildUnifiedFeatures(features, entry.mapping, entry.source);
  const fetched = features.length;

  if (rows.length === 0) {
    await finishSyncRun(supabase, runId, {
      status: "aborted",
      fetched_count: fetched,
      valid_count: 0,
      error: "no_features_after_normalization",
    });
    return { ok: false, source: entry.source, reason: "no_features", fetched };
  }

  const { upserted, skipped: rpcSkipped, errors, batchFailures } = await upsertInBatches(supabase, rows);
  const totalSkipped = normalizeSkipped + rpcSkipped;
  const failureRatio = fetched > 0 ? (totalSkipped + batchFailures) / fetched : 1;
  const shouldDeactivate = batchFailures === 0 && failureRatio <= UNIFIED_MAX_SKIPPED_RATIO;

  let deactivateResult: unknown = { skipped: true, reason: "not_run" };
  if (shouldDeactivate) {
    const keepIds = rows.map((r) => r.external_id).filter(Boolean);
    try {
      const { data, error } = await supabase.rpc("deactivate_stale_airspace_zones", {
        p_source: entry.source,
        p_country_code: "SE",
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
    valid_count: fetched - normalizeSkipped,
    upserted_count: upserted,
    deactivated_count: deactivated,
    error: errors.length ? JSON.stringify(errors).slice(0, 2000) : null,
    stats: { batch_failures: batchFailures, deactivate: deactivateResult, normalize_skipped: normalizeSkipped },
  });

  return {
    ok: batchFailures === 0,
    source: entry.source,
    typename: entry.typename,
    layer_id: entry.mapping.layer_id,
    fetched, upserted,
    skipped: totalSkipped,
    batch_failures: batchFailures,
    deactivate: deactivateResult,
    errors: errors.slice(0, 3),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireCronOrSuperadmin(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Sekvensielt for å ikke belaste LFV WFS unødig; 7 kall er raskt uansett.
    const results: Record<string, unknown>[] = [];
    for (const entry of LFV_LAYERS) {
      try {
        results.push(await syncOneLayer(supabase, entry));
      } catch (err) {
        results.push({ ok: false, source: entry.source, error: String(err) });
      }
    }

    const ok = results.every((r) => (r as any).ok !== false);
    return new Response(
      JSON.stringify({ ok, results, synced_at: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders);
    console.error("sync-se-drone-zones failed:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
