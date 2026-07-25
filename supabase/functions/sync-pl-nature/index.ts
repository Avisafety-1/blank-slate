// Sync polske verneomrader (GDOS Geoserwis) inn i unified airspace_zones.
// Kilde: https://sdi.gdos.gov.pl/wfs
// Lag (typeNames):
//   - gdos:parki_narodowe            (National parks)
//   - gdos:rezerwaty_przyrody        (Nature reserves)
//   - gdos:parki_krajobrazowe        (Landscape parks)
//   - gdos:obszary_natura2000_pta    (Natura 2000 SPA – birds)
//   - gdos:obszary_natura2000_sie    (Natura 2000 SAC – habitats)
//
// Tiled BBOX-hentning (samme pattern som sync-sweden-nature) fordi WFS-serveren
// har response caps. Polen bbox ~ (49-55N, 14-24E) i 1-graders ruter.
//
// Skriver til public.airspace_zones med source='pl_gdos_<layer>', country='PL',
// layer_id='verneomrader', zone_type='NATURE', restriction_type='NATURE_SENSITIVE'.
// Kartlaget plukker opp radene automatisk for allowlist-selskaper (Moderavdeling).

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

const ALLOWED_HOSTS = ["sdi.gdos.gov.pl"];
const WFS_URL = "https://sdi.gdos.gov.pl/wfs";
const PL_AUTHORITY_RANK = 20;
const UNIFIED_BATCH_SIZE = 500;
const TILE_MAX_FEATURES = 500;

// Polen bbox (approx landmass med buffer)
const PL_MIN_LAT = 49;
const PL_MAX_LAT = 55;
const PL_MIN_LNG = 14;
const PL_MAX_LNG = 24.5;
const TILE_SIZE_DEG = 1;

interface LayerDef {
  typeName: string;
  source: string;   // suffix mapped to source column
  theme: string;    // human-readable theme label
  shortCode: string;
}

// Multiple candidate typeName spellings — GDOS has renamed layers historically.
// Adapter tries them in order; first successful spelling wins for the run.
const LAYERS: Array<LayerDef & { candidates: string[] }> = [
  {
    typeName: "GDOS:ParkiNarodowe",
    candidates: ["GDOS:ParkiNarodowe"],
    source: "pl_gdos_park_narodowy",
    theme: "Park Narodowy",
    shortCode: "PN",
  },
  {
    typeName: "GDOS:Rezerwaty",
    candidates: ["GDOS:Rezerwaty"],
    source: "pl_gdos_rezerwat",
    theme: "Rezerwat przyrody",
    shortCode: "RP",
  },
  {
    typeName: "GDOS:ParkiKrajobrazowe",
    candidates: ["GDOS:ParkiKrajobrazowe"],
    source: "pl_gdos_park_krajobrazowy",
    theme: "Park Krajobrazowy",
    shortCode: "PK",
  },
  {
    typeName: "GDOS:ObszarySpecjalnejOchrony",
    candidates: ["GDOS:ObszarySpecjalnejOchrony"],
    source: "pl_gdos_natura2000_spa",
    theme: "Natura 2000 – Obszar Specjalnej Ochrony Ptaków (OSO)",
    shortCode: "OSO",
  },
  {
    typeName: "GDOS:SpecjalneObszaryOchrony",
    candidates: ["GDOS:SpecjalneObszaryOchrony"],
    source: "pl_gdos_natura2000_sac",
    theme: "Natura 2000 – Specjalny Obszar Ochrony Siedlisk (SOO)",
    shortCode: "SOO",
  },
  {
    typeName: "GDOS:ObszaryChronionegoKrajobrazu",
    candidates: ["GDOS:ObszaryChronionegoKrajobrazu"],
    source: "pl_gdos_obszar_chroniony",
    theme: "Obszar Chronionego Krajobrazu",
    shortCode: "OCK",
  },
];


function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

interface Tile { minLat: number; minLng: number; maxLat: number; maxLng: number; }

function generateTiles(): Tile[] {
  const tiles: Tile[] = [];
  for (let lat = PL_MIN_LAT; lat < PL_MAX_LAT; lat += TILE_SIZE_DEG) {
    for (let lng = PL_MIN_LNG; lng < PL_MAX_LNG; lng += TILE_SIZE_DEG) {
      tiles.push({
        minLat: lat, minLng: lng,
        maxLat: lat + TILE_SIZE_DEG, maxLng: lng + TILE_SIZE_DEG,
      });
    }
  }
  return tiles;
}

async function fetchTileWithTypeName(tile: Tile, typeName: string): Promise<any[]> {
  const bbox = `${tile.minLat},${tile.minLng},${tile.maxLat},${tile.maxLng},urn:ogc:def:crs:EPSG::4326`;
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: typeName,
    outputFormat: "application/json",
    srsName: "urn:ogc:def:crs:EPSG::4326",
    count: String(TILE_MAX_FEATURES),
    bbox,
  });
  const url = `${WFS_URL}?${params.toString()}`;
  const res = await safeFetch(
    url,
    { headers: { "User-Agent": "Avisafe-Sync/1.0", "Accept": "application/json" } },
    ALLOWED_HOSTS,
  );
  if (!res.ok) throw new Error(`GDOS WFS HTTP ${res.status} for ${typeName}`);
  const text = await res.text();
  // GDOS sometimes returns XML exceptions with 200 – guard against non-JSON.
  if (!text.startsWith("{")) throw new Error(`GDOS non-JSON for ${typeName}: ${text.slice(0, 120)}`);
  const json = JSON.parse(text);
  return Array.isArray(json?.features) ? json.features : [];
}

/** Resolve which typeName spelling actually works for a layer. Probes a small central tile. */
async function resolveTypeName(layer: LayerDef & { candidates: string[] }): Promise<string | null> {
  const probeTile: Tile = { minLat: 51.5, minLng: 19, maxLat: 52.5, maxLng: 20 };
  for (const candidate of layer.candidates) {
    try {
      await fetchTileWithTypeName(probeTile, candidate);
      return candidate;
    } catch (err) {
      console.warn(`[pl-nature] probe failed for ${candidate}: ${String(err).slice(0, 160)}`);
    }
  }
  return null;
}

function buildRow(f: any, layer: LayerDef): any | null {
  if (!f?.geometry) return null;
  const gt = f.geometry.type;
  if (gt !== "Polygon" && gt !== "MultiPolygon") return null;
  const p = (f.properties ?? {}) as Record<string, unknown>;
  const externalId =
    toStr(p["kod"]) ??
    toStr(p["KOD"]) ??
    toStr(p["kod_obszaru"]) ??
    toStr(p["objectid"]) ??
    toStr(p["OBJECTID"]) ??
    toStr(p["gml_id"]) ??
    toStr(f.id);
  if (!externalId) return null;
  const name =
    toStr(p["nazwa"]) ??
    toStr(p["NAZWA"]) ??
    toStr(p["nazwa_obszaru"]) ??
    layer.theme;
  const shortName = toStr(p["kod"]) ?? toStr(p["KOD"]) ?? layer.shortCode;
  return {
    country_code: "PL",
    source: layer.source,
    external_id: externalId,
    layer_id: "verneomrader",
    zone_type: "NATURE",
    restriction_type: "NATURE_SENSITIVE",
    display_class: "GREEN",
    theme: layer.theme,
    name,
    short_name: shortName,
    authority: "GDOŚ",
    lower_limit_m: null,
    upper_limit_m: null,
    lower_limit_raw: null,
    upper_limit_raw: null,
    altitude_reference: null,
    valid_from: null,
    valid_to: null,
    active: true,
    authority_rank: PL_AUTHORITY_RANK,
    dedupe_key: `pl:verneomrader:${layer.source}:${externalId}`,
    properties: { ...p, raw_source_layer: layer.source, adapter_version: "pl-c1" },
    geometry: JSON.stringify(f.geometry),
  };
}

async function upsertBatch(supabase: any, rows: any[]) {
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
      if (Array.isArray(res.errors) && res.errors.length) errors.push(...res.errors.slice(0, 3));
    } catch (err) {
      batchFailures++;
      errors.push({ batch_start: i, error: String(err) });
    }
  }
  return { upserted, skipped, errors, batchFailures };
}

async function startSyncRun(supabase: any, source: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("airspace_sync_runs")
      .insert({ source, country_code: "PL", status: "running" })
      .select("id").single();
    if (error) { console.warn("[pl-nature] startSyncRun:", error.message); return null; }
    return data.id;
  } catch { return null; }
}

async function finishSyncRun(supabase: any, runId: string | null, patch: Record<string, unknown>) {
  if (!runId) return;
  try {
    await supabase.from("airspace_sync_runs")
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq("id", runId);
  } catch (err) { console.warn("[pl-nature] finishSyncRun threw:", err); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireCronOrSuperadmin(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Chunk-parametere for orkestrering (unnga CPU-timeout ved store lag).
    let body: any = {};
    try { body = await req.json(); } catch {}
    const layerIndex = Math.max(0, Math.min(Number(body?.layerIndex ?? 0), LAYERS.length - 1));
    const tileStart = Math.max(0, Number(body?.tileStart ?? 0));
    const tileCount = Math.max(1, Math.min(Number(body?.tileCount ?? 30), 300));
    const finalize = body?.finalize === true;
    const clientKeepIds: string[] = Array.isArray(body?.keepIds) ? body.keepIds : [];

    const layer = LAYERS[layerIndex];
    const runId = await startSyncRun(supabase, layer.source);

    // Resolve typeName once per run
    const resolvedTypeName = await resolveTypeName(layer);
    if (!resolvedTypeName) {
      await finishSyncRun(supabase, runId, {
        status: "failed",
        error: `Could not resolve any typeName for ${layer.source}. Tried: ${layer.candidates.join(", ")}`,
      });
      return new Response(
        JSON.stringify({
          ok: false,
          source: layer.source,
          error: "typename_unresolved",
          triedCandidates: layer.candidates,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const allTiles = generateTiles();
    const tiles = allTiles.slice(tileStart, tileStart + tileCount);
    const totalTiles = allTiles.length;

    let fetched = 0;
    let upserted = 0;
    let normalizeSkipped = 0;
    let rpcSkipped = 0;
    let batchFailures = 0;
    let tilesAtCap = 0;
    const errors: unknown[] = [];
    const chunkKeepIds = new Set<string>();

    for (let ti = 0; ti < tiles.length; ti++) {
      const tile = tiles[ti];
      let feats: any[];
      try {
        feats = await fetchTileWithTypeName(tile, resolvedTypeName);
      } catch (err) {
        errors.push({ tile: tileStart + ti, error: String(err).slice(0, 200) });
        continue;
      }
      fetched += feats.length;
      if (feats.length >= TILE_MAX_FEATURES) tilesAtCap++;
      const rows: any[] = [];
      for (const f of feats) {
        const r = buildRow(f, layer);
        if (r) { rows.push(r); chunkKeepIds.add(r.external_id); }
        else normalizeSkipped++;
      }
      if (rows.length > 0) {
        const res = await upsertBatch(supabase, rows);
        upserted += res.upserted;
        rpcSkipped += res.skipped;
        batchFailures += res.batchFailures;
        if (res.errors.length) errors.push(...res.errors.slice(0, 2));
      }
    }

    let deactivateResult: unknown = { skipped: true, reason: "not_finalize" };
    if (finalize && batchFailures === 0) {
      const allKeepIds = Array.from(new Set([...clientKeepIds, ...chunkKeepIds]));
      try {
        const { data, error } = await supabase.rpc("deactivate_stale_airspace_zones", {
          p_source: layer.source, p_country_code: "PL", p_keep_external_ids: allKeepIds,
        });
        deactivateResult = error ? { error: error.message } : { ...data, keep_count: allKeepIds.length };
      } catch (err) { deactivateResult = { error: String(err) }; }
    }

    const nextTileStart = tileStart + tiles.length;
    const reachedEnd = nextTileStart >= totalTiles;
    const status = batchFailures > 0 ? "failed" : "success";
    const deactivated = typeof (deactivateResult as any)?.deactivated === "number"
      ? (deactivateResult as any).deactivated : 0;

    await finishSyncRun(supabase, runId, {
      status,
      fetched_count: fetched,
      valid_count: fetched - normalizeSkipped,
      upserted_count: upserted,
      deactivated_count: deactivated,
      error: errors.length ? JSON.stringify(errors).slice(0, 2000) : null,
      stats: {
        layer_index: layerIndex,
        layer_source: layer.source,
        resolved_typename: resolvedTypeName,
        tile_start: tileStart,
        tile_count: tiles.length,
        next_tile_start: nextTileStart,
        total_tiles: totalTiles,
        reached_end: reachedEnd,
        tiles_at_cap: tilesAtCap,
        finalize,
        batch_failures: batchFailures,
        deactivate: deactivateResult,
        normalize_skipped: normalizeSkipped,
        chunk_keep_ids: chunkKeepIds.size,
      },
    });

    return new Response(
      JSON.stringify({
        ok: batchFailures === 0,
        source: layer.source,
        layerIndex,
        resolvedTypeName,
        tileStart,
        tileCount: tiles.length,
        nextTileStart,
        totalTiles,
        reachedEnd,
        tilesAtCap,
        finalize,
        fetched,
        upserted,
        skipped: normalizeSkipped + rpcSkipped,
        batch_failures: batchFailures,
        keepIds: Array.from(chunkKeepIds),
        deactivate: deactivateResult,
        errors: errors.slice(0, 5),
        synced_at: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders);
    console.error("sync-pl-nature failed:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
