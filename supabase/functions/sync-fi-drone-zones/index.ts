// Fase B3: Sync finske dronesoner (Fintraffic Sky) inn i unified airspace_zones.
// API: https://api.sky.fintraffic.fi/api/airspace/zonesfromfile
//   → returnerer 30+ soner med referanser til /UploadedZones/*.json (GeoJSON).
// Én adapter mot Fintraffic som nasjonal drone-datakilde (Traficom-autorisert).
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

const ALLOWED_HOSTS = ["api.sky.fintraffic.fi", "sky.fintraffic.fi"];
const API_BASE = "https://api.sky.fintraffic.fi";
const ZONES_INDEX = `${API_BASE}/api/airspace/zonesfromfile`;
const FI_AUTHORITY_RANK = 20; // Fintraffic Sky (Traficom-godkjent kilde)

const UNIFIED_BATCH_SIZE = 500;
const UNIFIED_MAX_SKIPPED_RATIO = 0.1;
// Airspace-adapteren filtrerer bevisst bort drone-irrelevante feature-typer
// (FIR/CTA/TMA/SECTOR/ADIZ/RAS/...). Bruk høyere terskel så deaktivering
// av stale rader fortsatt kjøres etter filtrering.
const UNIFIED_MAX_SKIPPED_RATIO_AIRSPACE = 0.7;

// Feature.properties.type-verdier som IKKE er relevante for droneoperasjoner
// (høyt/nasjonalt luftrom som dekker enorme områder). Droppes helt.
const AIRSPACE_IRRELEVANT_TYPES = new Set([
  "FIR", "UIR", "SECTOR", "ADIZ", "RAS", "TMA_P", "PROTECT", "OTHER:RMZ",
]);
// Uklassifiserte features (type == null) med disse navne-suffiksene er
// CTA/TMA/FIR/UIR og dekker hele områder — droppes.
const AIRSPACE_IRRELEVANT_NAME_SUFFIXES = [" CTA", " TMA", " FIR", " UIR"];

type LayerMapping = {
  layer_id: string;
  zone_type: string;
  restriction_type: string;
  display_class: string;
};

// Fintraffic zoneType → felles klassifisering. Én "source" per zoneType-familie
// slik at deactivate_stale_airspace_zones kan rydde per gruppe.
function classifyZone(zoneType: string | null): { source: string; mapping: LayerMapping } {
  const z = (zoneType ?? "").toLowerCase();
  if (z.includes("uas")) {
    return {
      source: "fintraffic_fi_uas",
      mapping: { layer_id: "rpas", zone_type: "DRONE_NO_FLY", restriction_type: "APPROVAL_REQUIRED", display_class: "RED" },
    };
  }
  if (z.includes("temporary restricted")) {
    return {
      source: "fintraffic_fi_temp_restricted",
      mapping: { layer_id: "restriksjonsomrader", zone_type: "R", restriction_type: "PROHIBITED", display_class: "RED" },
    };
  }
  if (z.includes("temporary")) {
    return {
      source: "fintraffic_fi_temp_other",
      mapping: { layer_id: "fareomrader", zone_type: "DRONE_DANGER", restriction_type: "CAUTION", display_class: "AMBER" },
    };
  }
  if (z.includes("navwrng") || z.includes("nav wrng")) {
    return {
      source: "fintraffic_fi_navwrng",
      mapping: { layer_id: "fareomrader", zone_type: "DRONE_DANGER", restriction_type: "CAUTION", display_class: "AMBER" },
    };
  }
  // Airspace = CTR/TMA/R/D/P. Feature properties.type ("P"/"R"/"D") avgjør detaljene per feature.
  return {
    source: "fintraffic_fi_airspace",
    mapping: { layer_id: "airspace", zone_type: "CTR", restriction_type: "APPROVAL_REQUIRED", display_class: "AMBER" },
  };
}

function toStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

// Fintraffic upper/lower limit-strings: "1300 FT", "GND", "FL95", "UNL", "500 M".
function parseLimit(raw: string | null): { meters: number | null; ref: string | null } {
  if (!raw) return { meters: null, ref: null };
  const s = raw.trim().toUpperCase();
  if (s === "GND" || s === "SFC") return { meters: 0, ref: "AGL" };
  if (s === "UNL" || s === "UNLIMITED") return { meters: null, ref: "UNL" };
  const fl = s.match(/^FL\s*(\d+)/);
  if (fl) return { meters: Math.round(Number(fl[1]) * 100 * 0.3048), ref: "FL" };
  const ft = s.match(/^(\d+(?:\.\d+)?)\s*FT/);
  if (ft) return { meters: Math.round(Number(ft[1]) * 0.3048), ref: "AMSL" };
  const m = s.match(/^(\d+(?:\.\d+)?)\s*M/);
  if (m) return { meters: Math.round(Number(m[1])), ref: "AMSL" };
  const plain = s.match(/^(\d+(?:\.\d+)?)$/);
  if (plain) return { meters: Math.round(Number(plain[1]) * 0.3048), ref: "AMSL" };
  return { meters: null, ref: null };
}

// Per-feature type refinement for Airspace zones (P/R/D → riktig klassifisering).
function refineAirspaceFeature(base: LayerMapping, featureType: string | null): LayerMapping {
  const t = (featureType ?? "").toUpperCase();
  if (t === "P" || t === "R") {
    return { layer_id: "restriksjonsomrader", zone_type: "R", restriction_type: "PROHIBITED", display_class: "RED" };
  }
  if (t === "D") {
    return { layer_id: "fareomrader", zone_type: "DRONE_DANGER", restriction_type: "CAUTION", display_class: "AMBER" };
  }
  return base;
}

function buildUnifiedFeatures(
  features: any[],
  zoneMeta: any,
  source: string,
  baseMapping: LayerMapping,
): { rows: any[]; skipped: number } {
  const rows: any[] = [];
  let skipped = 0;
  const zoneId = zoneMeta.airSpaceDataID;
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    if (!f?.geometry) { skipped++; continue; }
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const featureType = toStringOrNull(p["type"]);
    const mapping = source === "fintraffic_fi_airspace"
      ? refineAirspaceFeature(baseMapping, featureType)
      : baseMapping;

    const name = toStringOrNull(p["name"]) ?? toStringOrNull(zoneMeta.zoneType) ?? "FI-zone";
    const seq = toStringOrNull(p["sequenceNumber"]) ?? String(i);
    const externalId = `fi:${zoneId}:${seq}:${name.toLowerCase().replace(/\s+/g, "_")}`.slice(0, 200);

    const lowerRaw = toStringOrNull(p["lowerLimit"]);
    const upperRaw = toStringOrNull(p["upperLimit"]);
    const lower = parseLimit(lowerRaw);
    const upper = parseLimit(upperRaw);

    const beginTime = toStringOrNull(p["beginTime"]);
    const endTimeRaw = toStringOrNull(p["endTime"]);
    const validTo = endTimeRaw && endTimeRaw.toLowerCase() !== "unknown" ? endTimeRaw : null;

    rows.push({
      country_code: "FI",
      source,
      external_id: externalId,
      layer_id: mapping.layer_id,
      zone_type: mapping.zone_type,
      restriction_type: mapping.restriction_type,
      display_class: mapping.display_class,
      theme: toStringOrNull(zoneMeta.zoneType),
      name,
      short_name: featureType,
      authority: "Fintraffic",
      lower_limit_m: lower.meters,
      upper_limit_m: upper.meters,
      lower_limit_raw: lowerRaw,
      upper_limit_raw: upperRaw,
      altitude_reference: upper.ref ?? lower.ref,
      valid_from: beginTime,
      valid_to: validTo,
      active: true,
      authority_rank: FI_AUTHORITY_RANK,
      dedupe_key: `fi:${mapping.layer_id}:${name.toLowerCase().trim()}`,
      properties: {
        ...p,
        fintraffic_zone_id: zoneId,
        fintraffic_zone_type: zoneMeta.zoneType,
        raw_source_layer: source,
        adapter_version: "b3",
      },
      geometry: JSON.stringify(f.geometry),
    });
  }
  return { rows, skipped };
}

async function fetchZoneIndex(): Promise<any[]> {
  const res = await safeFetch(ZONES_INDEX, {
    headers: { "User-Agent": "Avisafe-Sync/1.0", "Accept": "application/json" },
  }, ALLOWED_HOSTS);
  if (!res.ok) throw new Error(`Fintraffic index HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
}

async function fetchZoneFile(fileName: string): Promise<any[]> {
  const url = `${API_BASE}${fileName}`;
  const res = await safeFetch(url, {
    headers: { "User-Agent": "Avisafe-Sync/1.0", "Accept": "application/json" },
  }, ALLOWED_HOSTS);
  if (!res.ok) throw new Error(`Fintraffic file ${fileName} HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.features) ? json.features : [];
}

async function startSyncRun(supabase: any, source: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("airspace_sync_runs")
      .insert({ source, country_code: "FI", status: "running" })
      .select("id").single();
    if (error) { console.warn(`[fi-sync] startSyncRun ${source}:`, error.message); return null; }
    return data.id;
  } catch (err) {
    console.warn(`[fi-sync] startSyncRun threw ${source}:`, err);
    return null;
  }
}

async function finishSyncRun(supabase: any, runId: string | null, patch: Record<string, unknown>) {
  if (!runId) return;
  try {
    await supabase.from("airspace_sync_runs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", runId);
  } catch (err) { console.warn("[fi-sync] finishSyncRun threw:", err); }
}

async function upsertInBatches(supabase: any, rows: any[]) {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireCronOrSuperadmin(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const zones = await fetchZoneIndex();

    // Grupper rader per source (så vi kan deaktivere stale per gruppe).
    const grouped = new Map<string, { mapping: LayerMapping; rows: any[]; fetched: number; skipped: number }>();
    const perZoneResults: Record<string, unknown>[] = [];

    for (const zone of zones) {
      const cls = classifyZone(zone.zoneType);
      const bucket = grouped.get(cls.source) ?? { mapping: cls.mapping, rows: [], fetched: 0, skipped: 0 };
      grouped.set(cls.source, bucket);

      if (!zone.fileName) {
        perZoneResults.push({ zone_id: zone.airSpaceDataID, zoneType: zone.zoneType, skipped: "no_file" });
        continue;
      }
      try {
        const features = await fetchZoneFile(zone.fileName);
        const { rows, skipped } = buildUnifiedFeatures(features, zone, cls.source, cls.mapping);
        bucket.fetched += features.length;
        bucket.skipped += skipped;
        bucket.rows.push(...rows);
        perZoneResults.push({ zone_id: zone.airSpaceDataID, zoneType: zone.zoneType, features: features.length, rows: rows.length });
      } catch (err) {
        perZoneResults.push({ zone_id: zone.airSpaceDataID, zoneType: zone.zoneType, error: String(err) });
      }
    }

    // Nå: upsert + deaktivering per source-gruppe.
    const results: Record<string, unknown>[] = [];
    for (const [source, bucket] of grouped.entries()) {
      const runId = await startSyncRun(supabase, source);
      const { rows, fetched, skipped: normalizeSkipped, mapping } = bucket;

      if (rows.length === 0) {
        await finishSyncRun(supabase, runId, {
          status: "aborted", fetched_count: fetched, valid_count: 0,
          error: "no_features_after_normalization",
        });
        results.push({ ok: false, source, layer_id: mapping.layer_id, reason: "no_features", fetched });
        continue;
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
            p_source: source, p_country_code: "FI", p_keep_external_ids: keepIds,
          });
          deactivateResult = error ? { error: error.message } : data;
        } catch (err) { deactivateResult = { error: String(err) }; }
      } else {
        deactivateResult = { skipped: true, reason: batchFailures > 0 ? "batch_failures" : "high_skipped_ratio", failure_ratio: failureRatio };
      }

      const status = batchFailures > 0 ? "failed" : "success";
      const deactivated = typeof (deactivateResult as any)?.deactivated === "number"
        ? (deactivateResult as any).deactivated : 0;

      await finishSyncRun(supabase, runId, {
        status, fetched_count: fetched, valid_count: fetched - normalizeSkipped,
        upserted_count: upserted, deactivated_count: deactivated,
        error: errors.length ? JSON.stringify(errors).slice(0, 2000) : null,
        stats: { batch_failures: batchFailures, deactivate: deactivateResult, normalize_skipped: normalizeSkipped },
      });

      results.push({
        ok: batchFailures === 0, source, layer_id: mapping.layer_id,
        fetched, upserted, skipped: totalSkipped, batch_failures: batchFailures,
        deactivate: deactivateResult, errors: errors.slice(0, 3),
      });
    }

    const ok = results.every((r) => (r as any).ok !== false);
    return new Response(
      JSON.stringify({ ok, results, zones: perZoneResults, synced_at: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders);
    console.error("sync-fi-drone-zones failed:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
