// Sync Trafikstyrelsen (Denmark) drone zones + nature areas into dk_drone_zones / dk_nature_areas.
// Scheduled daily via pg_cron, also callable manually by superadmin.
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
  features.forEach((f, i) => {
    const n = normalizeDroneFeature(f, i);
    if (n) byLayer[n.layer_id].push(n);
  });

  const layerResults: Record<string, unknown> = {};
  for (const [layer_id, feats] of Object.entries(byLayer)) {
    const { data, error } = await supabase.rpc("bulk_upsert_dk_drone_zones", {
      p_layer_id: layer_id,
      p_features: feats,
    });
    layerResults[layer_id] = error ? { ok: false, error: error.message } : { ok: true, fetched: feats.length, ...(data ?? {}) };
  }
  return { ok: true, total: features.length, layers: layerResults };
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
    .filter(Boolean);

  const { data, error } = await supabase.rpc("bulk_upsert_dk_nature_areas", {
    p_features: normalized,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, fetched: features.length, ...(data ?? {}) };
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
