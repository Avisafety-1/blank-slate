// Sync svenske verneområder fra Naturvårdsverket WFS inn i unified airspace_zones.
// Kilde: https://geodata.naturvardsverket.se/naturvardsregistret/wfs
// FeatureType: Naturvardsregistret_WFS:SkyddadeOmraden
// SKYDDSTYP-attributt skiller verneform (Naturreservat, Nationalpark, Natura 2000, ...).
//
// ArcGIS WFS-serveren stotter ikke palitelig startIndex-paging med GEOJSON
// (returnerer trunkert eller malformet JSON pa store offsets), sa vi bruker
// tiled BBOX-hentning som i sync-de-drone-zones. Sverige (55-70N, 10-25E)
// deles i 1x1-graders ruter; hver rute returnerer opp til 500 features.
//
// Skriver til public.airspace_zones med source='naturvardsverket_se', country='SE',
// layer_id='verneomrader', zone_type='NATURE', restriction_type='NATURE_SENSITIVE'.
// Kartlaget "Verneomrader" plukker opp radene automatisk for allowlist-selskaper
// (Moderavdeling i C1) - ingen UI-endringer nodvendig.

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

const ALLOWED_HOSTS = ["geodata.naturvardsverket.se"];
const WFS_URL = "https://geodata.naturvardsverket.se/naturvardsregistret/wfs";
const TYPENAME = "Naturvardsregistret_WFS:SkyddadeOmraden";
const SOURCE = "naturvardsverket_se";
const SE_AUTHORITY_RANK = 20;

const UNIFIED_BATCH_SIZE = 500;
const TILE_MAX_FEATURES = 500; // server-side cap for GEOJSON output

// Sverige bounding box (approx landmass with buffer)
const SE_MIN_LAT = 55;
const SE_MAX_LAT = 70;
const SE_MIN_LNG = 10;
const SE_MAX_LNG = 25;
const TILE_SIZE_DEG = 1;

function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function normalizeTheme(skyddstyp: string | null): string {
  if (!skyddstyp) return "Ukjent";
  const s = skyddstyp.toLowerCase();
  if (s.includes("nationalpark")) return "Nationalpark";
  if (s.includes("naturreservat")) return "Naturreservat";
  if (s.includes("natura")) return "Natura 2000";
  if (s.includes("biotopskydd")) return "Biotopskydd";
  if (s.includes("djur") || s.includes("vaxtskydd") || s.includes("växtskydd"))
    return "Djur- och vaxtskyddsomrade";
  if (s.includes("naturvardsomrade") || s.includes("naturvårdsområde"))
    return "Naturvardsomrade";
  if (s.includes("landskapsbild")) return "Landskapsbildsskydd";
  if (s.includes("kultur")) return "Kulturreservat";
  return skyddstyp;
}

interface Tile { minLat: number; minLng: number; maxLat: number; maxLng: number; }

function generateTiles(): Tile[] {
  const tiles: Tile[] = [];
  for (let lat = SE_MIN_LAT; lat < SE_MAX_LAT; lat += TILE_SIZE_DEG) {
    for (let lng = SE_MIN_LNG; lng < SE_MAX_LNG; lng += TILE_SIZE_DEG) {
      tiles.push({
        minLat: lat, minLng: lng,
        maxLat: lat + TILE_SIZE_DEG, maxLng: lng + TILE_SIZE_DEG,
      });
    }
  }
  return tiles;
}

async function fetchTile(tile: Tile): Promise<any[]> {
  // bbox format for WFS 2.0: miny,minx,maxy,maxx,crs
  const bbox = `${tile.minLat},${tile.minLng},${tile.maxLat},${tile.maxLng},urn:ogc:def:crs:EPSG::4326`;
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: TYPENAME,
    outputFormat: "GEOJSON",
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
  if (!res.ok) throw new Error(`NV WFS HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.features) ? json.features : [];
}

function buildRow(f: any): any | null {
  if (!f?.geometry) return null;
  const gt = f.geometry.type;
  if (gt !== "Polygon" && gt !== "MultiPolygon") return null;
  const p = (f.properties ?? {}) as Record<string, unknown>;
  const externalId =
    toStr(p["NVRID"]) ??
    toStr(p["OBJECTID"]) ??
    toStr(p["GmlID"]) ??
    toStr(f.id);
  if (!externalId) return null;
  const skyddstyp = toStr(p["SKYDDSTYP"]);
  const theme = normalizeTheme(skyddstyp);
  const name = toStr(p["NAMN"]) ?? theme;
  const status = toStr(p["BESLUTSSTATUS"]);
  const active = !status || status.toLowerCase().startsWith("gall") || status.toLowerCase().startsWith("gäll");
  return {
    country_code: "SE",
    source: SOURCE,
    external_id: externalId,
    layer_id: "verneomrader",
    zone_type: "NATURE",
    restriction_type: "NATURE_SENSITIVE",
    display_class: "GREEN",
    theme,
    name,
    short_name: skyddstyp,
    authority: "Naturvardsverket",
    lower_limit_m: null,
    upper_limit_m: null,
    lower_limit_raw: null,
    upper_limit_raw: null,
    altitude_reference: null,
    valid_from: toStr(p["URSPR_GALLANDEDATUM"]) ?? toStr(p["SENASTE_GALLANDEDATUM"]),
    valid_to: null,
    active,
    authority_rank: SE_AUTHORITY_RANK,
    dedupe_key: `se:verneomrader:${externalId}`,
    properties: { ...p, raw_source_layer: SOURCE, adapter_version: "c1-tiled" },
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

async function startSyncRun(supabase: any): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("airspace_sync_runs")
      .insert({ source: SOURCE, country_code: "SE", status: "running" })
      .select("id").single();
    if (error) { console.warn("[nv-sync] startSyncRun:", error.message); return null; }
    return data.id;
  } catch { return null; }
}

async function finishSyncRun(supabase: any, runId: string | null, patch: Record<string, unknown>) {
  if (!runId) return;
  try {
    await supabase.from("airspace_sync_runs")
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq("id", runId);
  } catch (err) { console.warn("[nv-sync] finishSyncRun threw:", err); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireCronOrSuperadmin(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Chunk-parametere: gjor at vi kan orkestrere flere kall for a unnga CPU-limit.
    let body: any = {};
    try { body = await req.json(); } catch {}
    const tileStart = Math.max(0, Number(body?.tileStart ?? 0));
    const tileCount = Math.max(1, Math.min(Number(body?.tileCount ?? 30), 300));
    const finalize = body?.finalize === true;
    const clientKeepIds: string[] = Array.isArray(body?.keepIds) ? body.keepIds : [];

    // Rydd zombier
    try {
      await supabase.from("airspace_sync_runs")
        .update({ status: "failed", error: "superseded_by_new_run", finished_at: new Date().toISOString() })
        .eq("country_code", "SE").eq("source", SOURCE).eq("status", "running")
        .lt("started_at", new Date(Date.now() - 10 * 60_000).toISOString());
    } catch (err) { console.warn("[nv-sync] cleanup zombies:", err); }

    const runId = await startSyncRun(supabase);

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
        feats = await fetchTile(tile);
      } catch (err) {
        errors.push({ tile: tileStart + ti, error: String(err).slice(0, 200) });
        continue;
      }
      fetched += feats.length;
      if (feats.length >= TILE_MAX_FEATURES) tilesAtCap++;
      const rows: any[] = [];
      for (const f of feats) {
        const r = buildRow(f);
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
          p_source: SOURCE, p_country_code: "SE", p_keep_external_ids: allKeepIds,
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
        source: SOURCE,
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
    console.error("sync-sweden-nature failed:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
