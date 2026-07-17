// Fase B2: Sync tyske dronesoner (DFS DIPUL WFS) inn i unified airspace_zones.
// Ingen legacy-tabell for Tyskland. Går direkte i felles schema med authority_rank = 20.
// Kilde: https://uas-betrieb.dfs.de/homepage/en/geoservices/
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

const ALLOWED_HOSTS = ["uas-betrieb.de", "uas-betrieb.dfs.de"];
const WFS_BASE = "https://uas-betrieb.de/geoservices/dipul/ows";
const DE_AUTHORITY_RANK = 20; // DFS = nasjonal luftfartsmyndighet

const UNIFIED_BATCH_SIZE = 500;
const UNIFIED_MAX_SKIPPED_RATIO = 0.1;
// Enkelte lag har 5000-9000 features. WFS støtter paginering via count/startIndex.
const WFS_PAGE_SIZE = 5000;

type LayerMapping = {
  layer_id: string;
  zone_type: string;
  restriction_type: string;
  display_class: string;
};

// Prioriterte drone-relevante DIPUL-lag. Kartlagt til samme layer_id som NO/DK/SE
// slik at eksisterende UI-knapper styrer alt automatisk.
const DIPUL_LAYERS: Array<{ typename: string; source: string; mapping: LayerMapping }> = [
  // Kontrollsoner (CTR) — flyplasser med aktiv trafikk
  { typename: "dipul:kontrollzonen", source: "dfs_de_ctr",
    mapping: { layer_id: "airspace", zone_type: "CTR", restriction_type: "APPROVAL_REQUIRED", display_class: "AMBER" } },
  // Sivile flyplasser & mindre flyplasser (1.5 km / 1 km beskyttelse)
  { typename: "dipul:flughaefen", source: "dfs_de_flughaefen",
    mapping: { layer_id: "rpas", zone_type: "DRONE_NO_FLY", restriction_type: "APPROVAL_REQUIRED", display_class: "RED" } },
  { typename: "dipul:flugplaetze", source: "dfs_de_flugplaetze",
    mapping: { layer_id: "rpas", zone_type: "DRONE_NO_FLY", restriction_type: "APPROVAL_REQUIRED", display_class: "RED" } },
  // ED-R / permanente restriksjonsområder
  { typename: "dipul:flugbeschraenkungsgebiete", source: "dfs_de_edr",
    mapping: { layer_id: "restriksjonsomrader", zone_type: "R", restriction_type: "PROHIBITED", display_class: "RED" } },
  // Temporære restriksjoner (NOTAM-lignende, med valid_from/to)
  { typename: "dipul:temporaere_betriebseinschraenkungen", source: "dfs_de_tempo",
    mapping: { layer_id: "restriksjonsomrader", zone_type: "R", restriction_type: "PROHIBITED", display_class: "RED" } },
  // Naturvern
  { typename: "dipul:naturschutzgebiete", source: "dfs_de_naturschutz",
    mapping: { layer_id: "verneomrader", zone_type: "NATURE", restriction_type: "NATURE_SENSITIVE", display_class: "GREEN" } },
  { typename: "dipul:nationalparks", source: "dfs_de_nationalpark",
    mapping: { layer_id: "verneomrader", zone_type: "NATURE", restriction_type: "NATURE_SENSITIVE", display_class: "GREEN" } },
  { typename: "dipul:vogelschutzgebiete", source: "dfs_de_vogelschutz",
    mapping: { layer_id: "verneomrader", zone_type: "NATURE", restriction_type: "NATURE_SENSITIVE", display_class: "GREEN" } },
  { typename: "dipul:ffh-gebiete", source: "dfs_de_ffh",
    mapping: { layer_id: "verneomrader", zone_type: "NATURE", restriction_type: "NATURE_SENSITIVE", display_class: "GREEN" } },
  // Sikringsobjekter (militær, politi, myndigheter, ambassader, kraftverk, fengsler, sykehus)
  { typename: "dipul:militaerische_anlagen", source: "dfs_de_militaer",
    mapping: { layer_id: "sikringsobjekter", zone_type: "DRONE_PROTECTED_OBJECT", restriction_type: "NOTIFICATION", display_class: "AMBER" } },
  { typename: "dipul:polizei", source: "dfs_de_polizei",
    mapping: { layer_id: "sikringsobjekter", zone_type: "DRONE_PROTECTED_OBJECT", restriction_type: "NOTIFICATION", display_class: "AMBER" } },
  { typename: "dipul:justizvollzugsanstalten", source: "dfs_de_jva",
    mapping: { layer_id: "sikringsobjekter", zone_type: "DRONE_PROTECTED_OBJECT", restriction_type: "NOTIFICATION", display_class: "AMBER" } },
  { typename: "dipul:diplomatische_vertretungen", source: "dfs_de_diplomat",
    mapping: { layer_id: "sikringsobjekter", zone_type: "DRONE_PROTECTED_OBJECT", restriction_type: "NOTIFICATION", display_class: "AMBER" } },
  { typename: "dipul:internationale_organisationen", source: "dfs_de_intl_org",
    mapping: { layer_id: "sikringsobjekter", zone_type: "DRONE_PROTECTED_OBJECT", restriction_type: "NOTIFICATION", display_class: "AMBER" } },
  { typename: "dipul:kraftwerke", source: "dfs_de_kraftwerk",
    mapping: { layer_id: "sikringsobjekter", zone_type: "DRONE_PROTECTED_OBJECT", restriction_type: "NOTIFICATION", display_class: "AMBER" } },
  { typename: "dipul:umspannwerke", source: "dfs_de_umspannwerk",
    mapping: { layer_id: "sikringsobjekter", zone_type: "DRONE_PROTECTED_OBJECT", restriction_type: "NOTIFICATION", display_class: "AMBER" } },
  { typename: "dipul:industrieanlagen", source: "dfs_de_industri",
    mapping: { layer_id: "sikringsobjekter", zone_type: "DRONE_PROTECTED_OBJECT", restriction_type: "NOTIFICATION", display_class: "AMBER" } },
];

function toStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function toMeters(value: unknown, unit: string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const u = (unit ?? "").toLowerCase();
  if (u === "m") return Math.round(n);
  if (u === "ft") return Math.round(n * 0.3048);
  if (u === "fl") return Math.round(n * 100 * 0.3048);
  return null;
}

function normalizeAltRef(ref: string | null): string | null {
  if (!ref) return null;
  const r = ref.toUpperCase();
  if (r === "MSL" || r === "AMSL") return "AMSL";
  if (r === "AGL" || r === "GND" || r === "SFC") return "AGL";
  if (r === "FL") return "FL";
  return null;
}

function normalizeDedupeKey(mapping: LayerMapping, p: Record<string, unknown>, name: string | null): string | null {
  const ext = toStringOrNull(p["external_reference"]);
  if (ext) return `de:${mapping.layer_id}:${ext.toLowerCase()}`;
  if (name) return `de:${mapping.layer_id}:${name.toLowerCase().trim()}`;
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

    const externalId =
      toStringOrNull(p["external_reference"]) ??
      toStringOrNull(f.id) ??
      `${source}:${i}`;
    const name =
      toStringOrNull(p["name"]) ??
      toStringOrNull(p["generated_name_EN"]) ??
      toStringOrNull(p["generated_name_en"]) ??
      toStringOrNull(p["generated_name_DE"]) ??
      toStringOrNull(p["generated_name_de"]) ??
      externalId;

    const lowerRaw = toStringOrNull(p["lower_limit_altitude"]);
    const upperRaw = toStringOrNull(p["upper_limit_altitude"]);
    const lowerUnit = toStringOrNull(p["lower_limit_unit"]);
    const upperUnit = toStringOrNull(p["upper_limit_unit"]);
    const lowerM = toMeters(p["lower_limit_altitude"], lowerUnit);
    const upperM = toMeters(p["upper_limit_altitude"], upperUnit);
    const altRef = normalizeAltRef(toStringOrNull(p["upper_limit_alt_ref"])) ??
                   normalizeAltRef(toStringOrNull(p["lower_limit_alt_ref"]));

    const validFrom = toStringOrNull(p["start_time"]);
    const validTo = toStringOrNull(p["end_time"]);

    rows.push({
      country_code: "DE",
      source,
      external_id: externalId,
      layer_id: mapping.layer_id,
      zone_type: mapping.zone_type,
      restriction_type: mapping.restriction_type,
      display_class: mapping.display_class,
      theme: toStringOrNull(p["type_code"]),
      name,
      short_name: toStringOrNull(p["type_code"]),
      authority: "DFS",
      lower_limit_m: lowerM,
      upper_limit_m: upperM,
      lower_limit_raw: lowerRaw ? `${lowerRaw} ${lowerUnit ?? ""}`.trim() : null,
      upper_limit_raw: upperRaw ? `${upperRaw} ${upperUnit ?? ""}`.trim() : null,
      altitude_reference: altRef,
      valid_from: validFrom,
      valid_to: validTo,
      active: true,
      authority_rank: DE_AUTHORITY_RANK,
      dedupe_key: normalizeDedupeKey(mapping, p, name),
      properties: { ...p, raw_source_layer: source, adapter_version: "b2" },
      geometry: JSON.stringify(f.geometry),
    });
  }
  return { rows, skipped };
}

async function fetchDipulLayer(typename: string, bbox?: [number, number, number, number]): Promise<any[]> {
  const all: any[] = [];
  let startIndex = 0;
  for (let page = 0; page < 40; page++) {
    const params = new URLSearchParams({
      service: "WFS",
      version: "2.0.0",
      request: "GetFeature",
      typeNames: typename,
      outputFormat: "application/json",
      srsName: "EPSG:4326",
      count: String(WFS_PAGE_SIZE),
      startIndex: String(startIndex),
    });
    if (bbox) {
      // GeoServer short-form EPSG:4326 => lon,lat axis order
      params.set("bbox", `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]},EPSG:4326`);
    }
    const url = `${WFS_BASE}?${params.toString()}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": "Avisafe-Sync/1.0", "Accept": "application/json" },
    }, ALLOWED_HOSTS);
    if (!res.ok) throw new Error(`DIPUL ${typename} HTTP ${res.status}`);
    const json = await res.json();
    const feats = Array.isArray(json?.features) ? json.features : [];
    all.push(...feats);
    if (feats.length < WFS_PAGE_SIZE) break;
    startIndex += WFS_PAGE_SIZE;
  }
  return all;
}

// Tyskland bbox (fastland + øyer, litt margin)
const DE_BBOX: [number, number, number, number] = [5.5, 47.2, 15.1, 55.2];

// Store naturvern-lag inneholder tusenvis av polygoner og time-outer i én
// WFS-forespørsel. Hentes derfor per rutenett-tile (bbox-splitting).
const TILED_SOURCES = new Set([
  "dfs_de_naturschutz",
  "dfs_de_ffh",
  "dfs_de_vogelschutz",
]);

async function syncTiledLayer(
  supabase: any,
  entry: { typename: string; source: string; mapping: LayerMapping },
  tileGrid: number,
  budgetMs: number,
  tileStart: number,
  tileCount: number | null,
): Promise<{
  fetched: number; upserted: number; normalizeSkipped: number; rpcSkipped: number;
  batchFailures: number; errors: unknown[]; keepIds: string[];
  tilesDone: number; tilesTotal: number; tilesProcessed: number; nextTile: number; timedOut: boolean;
}> {
  const [minLon, minLat, maxLon, maxLat] = DE_BBOX;
  const dLon = (maxLon - minLon) / tileGrid;
  const dLat = (maxLat - minLat) / tileGrid;
  const seen = new Set<string>();
  const keepIds: string[] = [];
  const errors: unknown[] = [];
  const tilesTotal = tileGrid * tileGrid;
  const tileEnd = tileCount == null ? tilesTotal : Math.min(tilesTotal, tileStart + tileCount);
  const start = Date.now();
  let tilesProcessed = 0, timedOut = false;
  let fetched = 0, upserted = 0, normalizeSkipped = 0, rpcSkipped = 0, batchFailures = 0;
  let currentTile = tileStart;

  for (; currentTile < tileEnd; currentTile++) {
    if (Date.now() - start > budgetMs) { timedOut = true; break; }
    const ix = Math.floor(currentTile / tileGrid);
    const iy = currentTile % tileGrid;
    const bbox: [number, number, number, number] = [
      minLon + ix * dLon, minLat + iy * dLat,
      minLon + (ix + 1) * dLon, minLat + (iy + 1) * dLat,
    ];
    let feats: any[] = [];
    try {
      feats = await fetchDipulLayer(entry.typename, bbox);
    } catch (err) {
      console.warn(`[de-sync] tile ${currentTile}(${ix},${iy}) for ${entry.source} failed:`, String(err).slice(0, 200));
      errors.push({ tile: currentTile, error: String(err).slice(0, 200) });
      tilesProcessed++;
      continue;
    }
    fetched += feats.length;

    const uniqueFeats: any[] = [];
    for (const f of feats) {
      const key = String(
        f?.id ??
        f?.properties?.external_reference ??
        f?.properties?.gml_id ??
        `${entry.source}:${JSON.stringify(f?.geometry ?? {}).slice(0, 80)}`,
      );
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueFeats.push(f);
    }
    feats = [];

    const { rows, skipped: nSkip } = buildUnifiedFeatures(uniqueFeats, entry.mapping, entry.source);
    normalizeSkipped += nSkip;
    if (rows.length > 0) {
      for (const r of rows) if (r.external_id) keepIds.push(r.external_id);
      const res = await upsertInBatches(supabase, rows);
      upserted += res.upserted;
      rpcSkipped += res.skipped;
      batchFailures += res.batchFailures;
      if (res.errors.length) errors.push(...res.errors.slice(0, 3));
    }
    tilesProcessed++;
    console.log(`[de-sync] ${entry.source} tile ${currentTile + 1}/${tilesTotal} feats=${uniqueFeats.length} upserted=${upserted}`);
  }
  return {
    fetched, upserted, normalizeSkipped, rpcSkipped, batchFailures, errors, keepIds,
    tilesDone: currentTile, tilesTotal, tilesProcessed,
    nextTile: (timedOut || currentTile < tilesTotal) ? currentTile : tilesTotal,
    timedOut,
  };
}

async function startSyncRun(supabase: any, source: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("airspace_sync_runs")
      .insert({ source, country_code: "DE", status: "running" })
      .select("id").single();
    if (error) { console.warn(`[de-sync] startSyncRun ${source}:`, error.message); return null; }
    return data.id;
  } catch (err) {
    console.warn(`[de-sync] startSyncRun threw ${source}:`, err);
    return null;
  }
}

async function finishSyncRun(supabase: any, runId: string | null, patch: Record<string, unknown>) {
  if (!runId) return;
  try {
    await supabase.from("airspace_sync_runs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", runId);
  } catch (err) { console.warn("[de-sync] finishSyncRun threw:", err); }
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

async function syncOneLayer(
  supabase: any,
  entry: { typename: string; source: string; mapping: LayerMapping },
  opts: { tileGrid?: number; budgetMs?: number; tileStart?: number; tileCount?: number | null; finalize?: boolean } = {},
): Promise<Record<string, unknown>> {
  const runId = await startSyncRun(supabase, entry.source);
  const tiled = TILED_SOURCES.has(entry.source);
  const tileGrid = opts.tileGrid ?? 5;
  const budgetMs = opts.budgetMs ?? 220_000;
  const tileStart = opts.tileStart ?? 0;
  const tileCount = opts.tileCount ?? null;

  // ---- Streaming tiled path (store nature-lag) ----
  if (tiled) {
    let r;
    try {
      r = await syncTiledLayer(supabase, entry, tileGrid, budgetMs, tileStart, tileCount);
    } catch (err) {
      await finishSyncRun(supabase, runId, { status: "failed", error: String(err).slice(0, 500) });
      return { ok: false, source: entry.source, error: String(err) };
    }
    const isChunk = tileCount != null || tileStart > 0;
    const fullyDone = !r.timedOut && r.nextTile >= r.tilesTotal;
    const tileInfo = {
      tile_grid: tileGrid, tiles_processed: r.tilesProcessed,
      tile_start: tileStart, next_tile: r.nextTile, tiles_total: r.tilesTotal,
      timed_out: r.timedOut, finalize: !!opts.finalize,
    };
    const totalSkipped = r.normalizeSkipped + r.rpcSkipped;
    const failureRatio = r.fetched > 0 ? (totalSkipped + r.batchFailures) / r.fetched : 1;
    // Deaktiver KUN når vi bekrefter full sweep i én invocation (ikke chunks).
    const shouldDeactivate = !isChunk && fullyDone && r.batchFailures === 0 && failureRatio <= UNIFIED_MAX_SKIPPED_RATIO;

    let deactivateResult: unknown = { skipped: true, reason: isChunk ? "chunked_run" : "not_run" };
    if (shouldDeactivate && r.keepIds.length > 0) {
      try {
        const { data, error } = await supabase.rpc("deactivate_stale_airspace_zones", {
          p_source: entry.source, p_country_code: "DE", p_keep_external_ids: r.keepIds,
        });
        deactivateResult = error ? { error: error.message } : data;
      } catch (err) { deactivateResult = { error: String(err) }; }
    }

    const status = r.batchFailures > 0
      ? "failed"
      : (isChunk ? (fullyDone ? "success" : "partial") : (r.timedOut ? "partial" : "success"));
    const deactivated = typeof (deactivateResult as any)?.deactivated === "number"
      ? (deactivateResult as any).deactivated : 0;
    await finishSyncRun(supabase, runId, {
      status, fetched_count: r.fetched, valid_count: r.fetched - r.normalizeSkipped,
      upserted_count: r.upserted, deactivated_count: deactivated,
      error: r.errors.length ? JSON.stringify(r.errors).slice(0, 2000) : null,
      stats: { batch_failures: r.batchFailures, deactivate: deactivateResult, normalize_skipped: r.normalizeSkipped, tile: tileInfo },
    });
    return {
      ok: r.batchFailures === 0, source: entry.source, typename: entry.typename,
      layer_id: entry.mapping.layer_id, fetched: r.fetched, upserted: r.upserted,
      skipped: totalSkipped, batch_failures: r.batchFailures,
      deactivate: deactivateResult, errors: r.errors.slice(0, 3), tile: tileInfo,
      next_tile: r.nextTile, fully_done: fullyDone,
    };
  }


  // ---- Standard (in-memory) path ----
  let features: any[] = [];
  try {
    features = await fetchDipulLayer(entry.typename);
  } catch (err) {
    await finishSyncRun(supabase, runId, { status: "failed", error: String(err).slice(0, 500) });
    return { ok: false, source: entry.source, error: String(err) };
  }

  const { rows, skipped: normalizeSkipped } = buildUnifiedFeatures(features, entry.mapping, entry.source);
  const fetched = features.length;

  if (rows.length === 0) {
    await finishSyncRun(supabase, runId, {
      status: "aborted", fetched_count: fetched, valid_count: 0,
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
        p_source: entry.source, p_country_code: "DE", p_keep_external_ids: keepIds,
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

  return {
    ok: batchFailures === 0, source: entry.source, typename: entry.typename,
    layer_id: entry.mapping.layer_id, fetched, upserted, skipped: totalSkipped,
    batch_failures: batchFailures, deactivate: deactivateResult, errors: errors.slice(0, 3),
  };
}

// Grupper for å unngå at én invocation overskrider edge-timeout.
// Kan filtreres via body `{"group": "core|nature|security"}` eller `{"sources": [...]}`.
const LAYER_GROUPS: Record<string, string[]> = {
  core: ["dfs_de_ctr", "dfs_de_flughaefen", "dfs_de_flugplaetze", "dfs_de_edr", "dfs_de_tempo"],
  nature: ["dfs_de_naturschutz", "dfs_de_nationalpark", "dfs_de_vogelschutz", "dfs_de_ffh"],
  security: ["dfs_de_militaer", "dfs_de_polizei", "dfs_de_jva", "dfs_de_diplomat", "dfs_de_intl_org",
             "dfs_de_kraftwerk", "dfs_de_umspannwerk", "dfs_de_industri"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireCronOrSuperadmin(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let filter: Set<string> | null = null;
    let tileGrid: number | undefined;
    let budgetMs: number | undefined;
    let tileStart: number | undefined;
    let tileCount: number | null | undefined;
    try {
      const body = req.method === "POST" ? await req.json().catch(() => null) : null;
      if (body?.group && LAYER_GROUPS[body.group]) filter = new Set(LAYER_GROUPS[body.group]);
      else if (Array.isArray(body?.sources) && body.sources.length) filter = new Set(body.sources);
      if (typeof body?.tile_grid === "number") tileGrid = body.tile_grid;
      if (typeof body?.budget_ms === "number") budgetMs = body.budget_ms;
      if (typeof body?.tile_start === "number") tileStart = body.tile_start;
      if (typeof body?.tile_count === "number") tileCount = body.tile_count;
    } catch { /* empty body ok */ }

    const targets = filter ? DIPUL_LAYERS.filter((e) => filter!.has(e.source)) : DIPUL_LAYERS;

    // Rydd opp gamle "running"-rader (>10 min) fra tidligere time-outs slik at
    // vi ikke får en voksende liste av zombie-runs for tiled-lag.
    try {
      await supabase.from("airspace_sync_runs")
        .update({ status: "failed", error: "superseded_by_new_run", finished_at: new Date().toISOString() })
        .eq("country_code", "DE").eq("status", "running")
        .lt("started_at", new Date(Date.now() - 10 * 60_000).toISOString());
    } catch (err) { console.warn("[de-sync] cleanup zombie runs:", err); }

    // Sekvensielt for å ikke belaste DIPUL WFS.
    const results: Record<string, unknown>[] = [];
    for (const entry of targets) {
      try {
        results.push(await syncOneLayer(supabase, entry, { tileGrid, budgetMs, tileStart, tileCount }));
      } catch (err) {
        results.push({ ok: false, source: entry.source, error: String(err) });
      }
    }

    const ok = results.every((r) => (r as any).ok !== false);
    return new Response(
      JSON.stringify({ ok, filter: filter ? Array.from(filter) : "all", results, synced_at: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders);
    console.error("sync-de-drone-zones failed:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
