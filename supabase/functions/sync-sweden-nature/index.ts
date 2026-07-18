// Sync svenske verneområder fra Naturvårdsverket WFS inn i unified airspace_zones.
// Kilde: https://geodata.naturvardsverket.se/naturvardsregistret/wfs
// FeatureType: Naturvardsregistret_WFS:SkyddadeOmraden (~10 700 polygoner)
// SKYDDSTYP-attributt skiller verneform (Naturreservat, Nationalpark, Natura 2000, ...).
//
// Skriver til public.airspace_zones med source='naturvardsverket_se', country='SE',
// layer_id='verneomrader', zone_type='NATURE', restriction_type='NATURE_SENSITIVE'.
// Kartlaget "Verneområder" plukker opp radene automatisk for allowlist-selskaper
// (Moderavdeling i C1) — ingen UI-endringer nødvendig.

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
const UNIFIED_MAX_SKIPPED_RATIO = 0.1;
// ArcGIS WFS-serveren returnerer maks 500 features per svar for GEOJSON,
// og GeoJSON-utdata inneholder ikke numberMatched. Vi pager derfor til vi
// får færre enn 500 tilbake.
const WFS_PAGE_SIZE = 500;
const MAX_PAGES = 40;

function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

// SKYDDSTYP → normalisert kategori (theme). Ingen egen layer_id per type i C1 —
// alt havner på "verneomrader" for å matche eksisterende UI-knapp.
function normalizeTheme(skyddstyp: string | null): string {
  if (!skyddstyp) return "Ukjent";
  const s = skyddstyp.toLowerCase();
  if (s.includes("nationalpark")) return "Nationalpark";
  if (s.includes("naturreservat")) return "Naturreservat";
  if (s.includes("natura")) return "Natura 2000";
  if (s.includes("biotopskydd")) return "Biotopskydd";
  if (s.includes("djur") || s.includes("växtskydd") || s.includes("vaxtskydd"))
    return "Djur- och växtskyddsområde";
  if (s.includes("naturvårdsområde") || s.includes("naturvardsomrade"))
    return "Naturvårdsområde";
  if (s.includes("landskapsbild")) return "Landskapsbildsskydd";
  if (s.includes("kultur")) return "Kulturreservat";
  return skyddstyp;
}

async function fetchPage(startIndex: number): Promise<{ features: any[]; matched: number }> {
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: TYPENAME,
    outputFormat: "GEOJSON",
    srsName: "urn:ogc:def:crs:EPSG::4326",
    count: String(WFS_PAGE_SIZE),
    startIndex: String(startIndex),
  });
  const url = `${WFS_URL}?${params.toString()}`;
  const res = await safeFetch(
    url,
    { headers: { "User-Agent": "Avisafe-Sync/1.0", "Accept": "application/json" } },
    ALLOWED_HOSTS,
  );
  if (!res.ok) throw new Error(`NV WFS HTTP ${res.status}`);
  const json = await res.json();
  const features = Array.isArray(json?.features) ? json.features : [];
  const matched = Number(json?.numberMatched ?? json?.totalFeatures ?? features.length);
  return { features, matched };
}

function buildRows(features: any[]): { rows: any[]; skipped: number } {
  const rows: any[] = [];
  let skipped = 0;
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    if (!f?.geometry) { skipped++; continue; }
    const gt = f.geometry.type;
    if (gt !== "Polygon" && gt !== "MultiPolygon") { skipped++; continue; }
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const externalId =
      toStr(p["NVRID"]) ??
      toStr(p["OBJECTID"]) ??
      toStr(p["GmlID"]) ??
      toStr(f.id) ??
      `nv:${i}`;
    const skyddstyp = toStr(p["SKYDDSTYP"]);
    const theme = normalizeTheme(skyddstyp);
    const name = toStr(p["NAMN"]) ?? theme;
    const status = toStr(p["BESLUTSSTATUS"]);
    const active = !status || status.toLowerCase().startsWith("gäll") || status.toLowerCase().startsWith("gall");

    rows.push({
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
      authority: "Naturvårdsverket",
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
      properties: { ...p, raw_source_layer: SOURCE, adapter_version: "c1" },
      geometry: JSON.stringify(f.geometry),
    });
  }
  return { rows, skipped };
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

async function startSyncRun(supabase: any): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("airspace_sync_runs")
      .insert({ source: SOURCE, country_code: "SE", status: "running" })
      .select("id").single();
    if (error) { console.warn("[nv-sync] startSyncRun:", error.message); return null; }
    return data.id;
  } catch (err) {
    console.warn("[nv-sync] startSyncRun threw:", err);
    return null;
  }
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

    // Chunk-parametere fra request body: gjør at vi kan orkestrere flere kall
    // for å unngå CPU-limit på Edge Function når hele datasettet (~10-11k features) skal inn.
    let body: any = {};
    try { body = await req.json(); } catch { /* ok */ }
    const inputStart = Number(body?.startIndex ?? 0);
    const maxPages = Math.max(1, Math.min(Number(body?.maxPages ?? 6), MAX_PAGES));
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

    let startIndex = inputStart;
    let fetched = 0;
    let upserted = 0;
    let normalizeSkipped = 0;
    let rpcSkipped = 0;
    let batchFailures = 0;
    const errors: unknown[] = [];
    const chunkKeepIds: string[] = [];
    let reachedEnd = false;

    for (let page = 0; page < maxPages; page++) {
      let pageRes: { features: any[]; matched: number };
      try {
        pageRes = await fetchPage(startIndex);
      } catch (err) {
        errors.push({ page, error: String(err).slice(0, 200) });
        break;
      }
      const feats = pageRes.features;
      fetched += feats.length;

      const { rows, skipped: nSkip } = buildRows(feats);
      normalizeSkipped += nSkip;
      if (rows.length > 0) {
        for (const r of rows) if (r.external_id) chunkKeepIds.push(r.external_id);
        const res = await upsertInBatches(supabase, rows);
        upserted += res.upserted;
        rpcSkipped += res.skipped;
        batchFailures += res.batchFailures;
        if (res.errors.length) errors.push(...res.errors.slice(0, 3));
      }
      console.log(`[nv-sync] chunk-start=${inputStart} page=${page} start=${startIndex} feats=${feats.length} upserted=${upserted}`);
      startIndex += WFS_PAGE_SIZE;
      if (feats.length < WFS_PAGE_SIZE) { reachedEnd = true; break; }
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
        chunk_start: inputStart,
        next_start: startIndex,
        reached_end: reachedEnd,
        finalize,
        batch_failures: batchFailures,
        deactivate: deactivateResult,
        normalize_skipped: normalizeSkipped,
        chunk_keep_ids: chunkKeepIds.length,
      },
    });

    return new Response(
      JSON.stringify({
        ok: batchFailures === 0,
        source: SOURCE,
        chunkStart: inputStart,
        nextStart: startIndex,
        reachedEnd,
        finalize,
        fetched,
        upserted,
        skipped: normalizeSkipped + rpcSkipped,
        batch_failures: batchFailures,
        keepIds: chunkKeepIds,
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
