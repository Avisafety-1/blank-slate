/**
 * Map3D — 3D-kartmodus for /kart bygd på MapLibre GL JS.
 *
 * MVP-lag (alle via gratis kilder, ingen API-nøkkel påkrevd):
 *  - Basemap: OpenFreeMap "liberty" (OpenMapTiles-stil, inkluderer building-features)
 *  - Terreng + hillshade: AWS Terrarium DEM (gratis, ingen nøkkel)
 *  - 3D-bygninger: fill-extrusion på OpenMapTiles "building"-laget
 *  - Oppdrag (missions), NSM/RPAS/CTR-restriksjoner, NOTAM, SafeSky-trafikk og
 *    FlightHub 2 / DJI live-posisjoner — alle som GeoJSON-sources med
 *    klikk-popups og periodisk refresh.
 *
 * Bevisst utelatt fra MVP (kun synlig i 2D): OpenAIP, CAA-detaljlag,
 * naturvern, kraftlinjer, vær-overlay, SORA-buffere.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl, { Map as MlMap, GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";

interface Map3DProps {
  initialCenter?: [number, number]; // [lat, lng]
  initialZoom?: number;
  onMissionClick?: (mission: any) => void;
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** OpenFreeMap free style — inkluderer OpenMapTiles bygnings-features. */
const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

/** AWS Terrarium DEM — gratis, ingen nøkkel. */
const TERRAIN_TILES = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png";

const LIVE_POLL_MS = 5000;
const STATIC_POLL_MS = 60_000;

/** Generer en sirkel-polygon (GeoJSON) rundt et punkt — for NOTAM-radius. */
function circlePolygon(lat: number, lng: number, radiusM: number, steps = 64): GeoJSON.Polygon {
  const coords: [number, number][] = [];
  const R = 6371000;
  const latRad = (lat * Math.PI) / 180;
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI;
    const dByR = radiusM / R;
    const newLat = Math.asin(
      Math.sin(latRad) * Math.cos(dByR) + Math.cos(latRad) * Math.sin(dByR) * Math.cos(bearing)
    );
    const newLng =
      (lng * Math.PI) / 180 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(dByR) * Math.cos(latRad),
        Math.cos(dByR) - Math.sin(latRad) * Math.sin(newLat)
      );
    coords.push([(newLng * 180) / Math.PI, (newLat * 180) / Math.PI]);
  }
  return { type: "Polygon", coordinates: [coords] };
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export default function Map3D({ initialCenter, initialZoom = 11, onMissionClick }: Map3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const onMissionClickRef = useRef(onMissionClick);
  onMissionClickRef.current = onMissionClick;

  const center: [number, number] = initialCenter
    ? [initialCenter[1], initialCenter[0]] // → [lng, lat]
    : [10.7522, 59.9139]; // Oslo

  /* ----------------------------------------------------------------------- */
  /* Init map + basemap + terrain + 3D buildings                              */
  /* ----------------------------------------------------------------------- */
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center,
      zoom: initialZoom,
      pitch: 60,
      bearing: -20,
      maxPitch: 85,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("style.load", () => {
      // Terrain DEM
      if (!map.getSource("terrain-dem")) {
        map.addSource("terrain-dem", {
          type: "raster-dem",
          tiles: [TERRAIN_TILES],
          tileSize: 256,
          encoding: "terrarium",
          maxzoom: 15,
        });
      }
      try {
        map.setTerrain({ source: "terrain-dem", exaggeration: 1.2 });
      } catch (e) {
        console.warn("[Map3D] Terrain ikke støttet:", e);
      }

      // Hillshade
      if (!map.getLayer("hillshade")) {
        map.addLayer({
          id: "hillshade",
          type: "hillshade",
          source: "terrain-dem",
          paint: {
            "hillshade-shadow-color": "#000000",
            "hillshade-exaggeration": 0.4,
          },
        });
      }

      // Sky / atmosfære
      try {
        map.setSky({
          "sky-color": "#87CEEB",
          "horizon-color": "#ffffff",
          "fog-color": "#cfe2f3",
          "sky-horizon-blend": 0.6,
          "horizon-fog-blend": 0.5,
          "fog-ground-blend": 0.5,
          "atmosphere-blend": [
            "interpolate", ["linear"], ["zoom"],
            0, 1,
            10, 1,
            12, 0.5
          ],
        } as any);
      } catch {
        /* setSky kun i MapLibre 5+; safe-guarded */
      }

      // 3D-bygninger — OpenFreeMap har "building"-laget i sin vektorkilde.
      // Vi finner kilde-id dynamisk og legger til en fill-extrusion ovenpå.
      const layers = map.getStyle().layers ?? [];
      const labelLayerId = layers.find((l) => l.type === "symbol")?.id;
      // OpenFreeMap source-id er typisk "openmaptiles"
      const styleSources = map.getStyle().sources || {};
      const omtSource = Object.keys(styleSources).find((k) => k === "openmaptiles") || "openmaptiles";

      if (styleSources[omtSource] && !map.getLayer("3d-buildings")) {
        try {
          map.addLayer(
            {
              id: "3d-buildings",
              source: omtSource,
              "source-layer": "building",
              type: "fill-extrusion",
              minzoom: 14,
              paint: {
                "fill-extrusion-color": [
                  "interpolate", ["linear"], ["get", "render_height"],
                  0, "#d8d4cd",
                  50, "#bcb6ab",
                  150, "#9c9588",
                ],
                "fill-extrusion-height": [
                  "case",
                  ["has", "render_height"],
                  ["get", "render_height"],
                  10,
                ],
                "fill-extrusion-base": [
                  "case",
                  ["has", "render_min_height"],
                  ["get", "render_min_height"],
                  0,
                ],
                "fill-extrusion-opacity": 0.85,
              },
            },
            labelLayerId
          );
        } catch (e) {
          console.warn("[Map3D] 3D-bygninger kunne ikke legges til:", e);
        }
      }

      addOperationalLayers(map);
      setStyleReady(true);
    });

    return () => {
      setStyleReady(false);
      try {
        map.remove();
      } catch {
        /* suppress unmount errors */
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------------------------------------------------- */
  /* Add operational data layers (sources + paint/symbol layers)              */
  /* ----------------------------------------------------------------------- */
  const addOperationalLayers = (map: MlMap) => {
    // GeoJSON sources (tom inntil data hentes)
    const addEmpty = (id: string) => {
      if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: EMPTY_FC });
    };
    ["src-missions", "src-notams", "src-restr", "src-safesky", "src-fh2"].forEach(addEmpty);

    // Restriksjoner — fill + outline
    map.addLayer({
      id: "restr-fill",
      type: "fill",
      source: "src-restr",
      paint: {
        "fill-color": ["coalesce", ["get", "color"], "#ef4444"],
        "fill-opacity": 0.25,
      },
    });
    map.addLayer({
      id: "restr-line",
      type: "line",
      source: "src-restr",
      paint: {
        "line-color": ["coalesce", ["get", "color"], "#ef4444"],
        "line-width": 1.5,
      },
    });

    // NOTAM — gul fill + dashed line
    map.addLayer({
      id: "notam-fill",
      type: "fill",
      source: "src-notams",
      paint: { "fill-color": "#f59e0b", "fill-opacity": 0.18 },
    });
    map.addLayer({
      id: "notam-line",
      type: "line",
      source: "src-notams",
      paint: { "line-color": "#f59e0b", "line-width": 1.5, "line-dasharray": [3, 2] },
    });

    // Oppdrag — sirkler (større + farget per status)
    map.addLayer({
      id: "missions-circle",
      type: "circle",
      source: "src-missions",
      paint: {
        "circle-radius": 8,
        "circle-color": ["coalesce", ["get", "color"], "#3b82f6"],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });

    // SafeSky trafikk
    map.addLayer({
      id: "safesky-circle",
      type: "circle",
      source: "src-safesky",
      paint: {
        "circle-radius": 6,
        "circle-color": "#22c55e",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    });

    // FlightHub 2 / DJI live
    map.addLayer({
      id: "fh2-circle",
      type: "circle",
      source: "src-fh2",
      paint: {
        "circle-radius": 8,
        "circle-color": "#a855f7",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });

    // Cursor + popup-bindings
    const clickableLayers = ["restr-fill", "notam-fill", "missions-circle", "safesky-circle", "fh2-circle"];
    for (const lid of clickableLayers) {
      map.on("mouseenter", lid, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", lid, () => (map.getCanvas().style.cursor = ""));
    }

    map.on("click", "missions-circle", (e: MapMouseEvent & { features?: any[] }) => {
      const f = e.features?.[0];
      if (!f) return;
      const id = f.properties?.id;
      if (!id) return;
      // Hent full mission og send opp
      supabase
        .from("missions")
        .select("*")
        .eq("id", id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) onMissionClickRef.current?.(data);
        });
    });

    const bindPopup = (lid: string, render: (props: any) => string) => {
      map.on("click", lid, (e: MapMouseEvent & { features?: any[] }) => {
        const f = e.features?.[0];
        if (!f) return;
        new maplibregl.Popup({ maxWidth: "320px" })
          .setLngLat(e.lngLat)
          .setHTML(render(f.properties || {}))
          .addTo(map);
      });
    };

    bindPopup("restr-fill", (p) => `<strong>${escapeHtml(p.label || "Restriksjon")}</strong><br/>${escapeHtml(p.name || "")}`);
    bindPopup("notam-fill", (p) =>
      `<strong>NOTAM</strong><br/><pre style="white-space:pre-wrap;font-family:monospace;font-size:11px;margin:4px 0 0">${escapeHtml(p.text || "")}</pre>`
    );
    bindPopup("safesky-circle", (p) => `<strong>${escapeHtml(p.type || "Trafikk")}</strong><br/>Høyde: ${p.altitude ?? "?"} m<br/>Kurs: ${p.course ?? "?"}°`);
    bindPopup("fh2-circle", (p) => `<strong>${escapeHtml(p.device || "Drone")}</strong><br/>Høyde: ${p.altitude ?? "?"} m<br/>Hastighet: ${p.speed ?? "?"} m/s`);
  };

  /* ----------------------------------------------------------------------- */
  /* Data fetching                                                            */
  /* ----------------------------------------------------------------------- */
  const setData = useCallback((sourceId: string, fc: GeoJSON.FeatureCollection) => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(sourceId) as GeoJSONSource | undefined;
    if (src) src.setData(fc);
  }, []);

  // Restriksjoner (NSM / RPAS 5km / CTR-TIZ) — ArcGIS GeoJSON (statisk)
  useEffect(() => {
    if (!styleReady) return;
    let cancelled = false;
    const fetchRestr = async () => {
      const feeds: { url: string; color: string; label: string }[] = [
        { url: "https://services9.arcgis.com/qCxEdsGu1A7NwfY1/ArcGIS/rest/services/Forbudsomr%c3%a5derNSM_v/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson", color: "#ef4444", label: "NSM forbudsområde" },
        { url: "https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_AVIGIS1/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson", color: "#f97316", label: "RPAS 5km" },
        { url: "https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_CTR_TIZ/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson", color: "#ec4899", label: "CTR/TIZ" },
      ];
      const features: GeoJSON.Feature[] = [];
      await Promise.all(
        feeds.map(async ({ url, color, label }) => {
          try {
            const res = await fetch(url);
            if (!res.ok) return;
            const json = (await res.json()) as GeoJSON.FeatureCollection;
            for (const f of json.features ?? []) {
              features.push({
                ...f,
                properties: {
                  ...(f.properties || {}),
                  color,
                  label,
                  name: (f.properties as any)?.navn || (f.properties as any)?.name || "",
                },
              });
            }
          } catch (e) {
            console.warn(`[Map3D] Restriksjoner feilet (${label}):`, e);
          }
        })
      );
      if (!cancelled) setData("src-restr", { type: "FeatureCollection", features });
    };
    fetchRestr();
    const id = window.setInterval(fetchRestr, STATIC_POLL_MS * 10);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [styleReady, setData]);

  // Missions (fra Supabase)
  useEffect(() => {
    if (!styleReady) return;
    let cancelled = false;
    const fetchMissions = async () => {
      const { data, error } = await supabase
        .from("missions")
        .select("id, latitude, longitude, status, tittel, navn")
        .not("latitude", "is", null)
        .not("longitude", "is", null);
      if (error || cancelled || !data) return;
      const features: GeoJSON.Feature[] = data
        .filter((m: any) => m.latitude != null && m.longitude != null)
        .map((m: any) => {
          let color = "#3b82f6";
          if (m.status === "Pågående") color = "#eab308";
          else if (m.status === "Fullført") color = "#6b7280";
          return {
            type: "Feature",
            geometry: { type: "Point", coordinates: [m.longitude, m.latitude] },
            properties: { id: m.id, color, title: m.tittel || m.navn || "Oppdrag" },
          };
        });
      setData("src-missions", { type: "FeatureCollection", features });
    };
    fetchMissions();
    const id = window.setInterval(fetchMissions, STATIC_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [styleReady, setData]);

  // NOTAMs (fra Supabase, geometry_geojson — sirkler er allerede polygonisert i feltet)
  useEffect(() => {
    if (!styleReady) return;
    let cancelled = false;
    const fetchNotams = async () => {
      const { data, error } = await supabase
        .from("notams")
        .select("id, geometry_geojson, center_lat, center_lng, notam_text")
        .or(`effective_end.gt.${new Date().toISOString()},effective_end.is.null`)
        .limit(1000);
      if (error || cancelled || !data) return;
      const features: GeoJSON.Feature[] = [];
      for (const n of data as any[]) {
        const text = n.notam_text || "";
        if (n.geometry_geojson) {
          features.push({ type: "Feature", geometry: n.geometry_geojson as any, properties: { text } });
        } else if (n.center_lat != null && n.center_lng != null) {
          // Fallback: 5 km sirkel rundt senterpunktet
          const poly = circlePolygon(n.center_lat, n.center_lng, 5000);
          features.push({ type: "Feature", geometry: poly, properties: { text } });
        }
      }
      setData("src-notams", { type: "FeatureCollection", features });
    };
    fetchNotams();
    const id = window.setInterval(fetchNotams, STATIC_POLL_MS * 5);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [styleReady, setData]);

  // SafeSky live trafikk
  useEffect(() => {
    if (!styleReady) return;
    let cancelled = false;
    const fetchSafeSky = async () => {
      const { data, error } = await supabase
        .from("safesky_beacons")
        .select("id, latitude, longitude, altitude, course, beacon_type")
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .limit(500);
      if (error || cancelled || !data) return;
      const features: GeoJSON.Feature[] = data.map((b: any) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [b.longitude, b.latitude] },
        properties: { altitude: b.altitude, course: b.course, type: b.beacon_type },
      }));
      setData("src-safesky", { type: "FeatureCollection", features });
    };
    fetchSafeSky();
    const id = window.setInterval(fetchSafeSky, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [styleReady, setData]);

  // FlightHub 2 / DJI live posisjoner
  useEffect(() => {
    if (!styleReady) return;
    let cancelled = false;
    const fetchFh2 = async () => {
      const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data, error } = await (supabase as any)
        .from("flighthub2_positions")
        .select("sn, uas_model, lat, lng, altitude_m, height_m, ground_speed_ms, time_stamp")
        .gte("time_stamp", since)
        .not("lat", "is", null)
        .not("lng", "is", null)
        .limit(500);
      if (error || cancelled || !data) return;
      // Behold kun siste posisjon per drone
      const latest = new Map<string, any>();
      for (const p of data) {
        const key = p.sn || "unknown";
        const prev = latest.get(key);
        if (!prev || new Date(p.time_stamp) > new Date(prev.time_stamp)) latest.set(key, p);
      }
      const features: GeoJSON.Feature[] = Array.from(latest.values()).map((p: any) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: {
          device: p.uas_model || p.sn || "Drone",
          altitude: p.altitude_m ?? p.height_m,
          speed: p.ground_speed_ms,
        },
      }));
      setData("src-fh2", { type: "FeatureCollection", features });
    };
    fetchFh2();
    const id = window.setInterval(fetchFh2, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [styleReady, setData]);

  /* ----------------------------------------------------------------------- */
  /* UI                                                                       */
  /* ----------------------------------------------------------------------- */
  const resetNorth = () => {
    mapRef.current?.easeTo({ bearing: 0, pitch: 60, duration: 600 });
  };

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      <Button
        size="icon"
        variant="secondary"
        onClick={resetNorth}
        className="absolute top-3 right-16 z-[400] shadow-lg bg-card hover:bg-accent"
        aria-label="Nullstill kompass"
      >
        <Compass className="h-5 w-5" />
      </Button>
    </div>
  );
}
