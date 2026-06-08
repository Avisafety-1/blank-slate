import L from "leaflet";
import polygonClipping from "polygon-clipping";
import type { MultiPolygon as ClipMultiPolygon, Polygon as ClipPolygon } from "polygon-clipping";
import { supabase } from "@/integrations/supabase/client";
import { droneAnimatedIcon } from "@/lib/mapIcons";
import droneStaticIcon from "@/assets/drone-static.png";
import { renderTrafficPopup } from "@/lib/mapTrafficPopup";
import airportIcon from "@/assets/airport-icon.png";
import { getCache, bboxCovered, padBBox, diffRender, hashString, resetCache } from "@/lib/viewportLayerCache";
import { attachHoverPromotion } from "@/lib/mapHoverPromotion";

// ---- Avinor RPAS 5km dedupe ----
// Modul-lokal cache av sentroider for de ~50 Avinor-flyplassene som tegnes
// av fetchRpasData. Brukes av CAA "flyplasser" + AIP "ATZ"-rendering for å
// hoppe over duplikate 5km-sirkler rundt samme lufthavn (f.eks. Notodden
// sjøflyplass vs ENNO Notodden lufthavn). Avinor-popupen er mer informativ,
// så den vinner alltid.
const AVINOR_RPAS_DEDUPE_KM = 3;
let avinorRpasCenters: Array<{ lat: number; lng: number }> = [];

export function setAvinorRpasCenters(centers: Array<{ lat: number; lng: number }>) {
  avinorRpasCenters = centers;
}

export function isCoveredByAvinorRpas(lat: number, lng: number): boolean {
  if (!avinorRpasCenters.length) return false;
  const R = 6371; // km
  const toRad = (d: number) => (d * Math.PI) / 180;
  for (const c of avinorRpasCenters) {
    const dLat = toRad(c.lat - lat);
    const dLng = toRad(c.lng - lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat)) * Math.cos(toRad(c.lat)) * Math.sin(dLng / 2) ** 2;
    const d = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
    if (d <= AVINOR_RPAS_DEDUPE_KM) return true;
  }
  return false;
}

interface FetchParams {
  layer: L.LayerGroup;
  mode: string;
  pane?: string;
}

interface GeoJsonFetchParams extends FetchParams {
  geoJsonRef?: React.MutableRefObject<L.GeoJSON<any> | null>;
  aipGeoJsonLayersRef?: React.MutableRefObject<L.GeoJSON[]>;
  setGeoJsonInteractivity: (geoJson: L.GeoJSON<any> | null, enabled: boolean) => void;
  modeRef: React.MutableRefObject<string>;
}

export async function fetchNsmData(params: GeoJsonFetchParams) {
  const { layer, mode, geoJsonRef, setGeoJsonInteractivity, modeRef } = params;
  try {
    const url = "https://services9.arcgis.com/qCxEdsGu1A7NwfY1/ArcGIS/rest/services/Forbudsomr%c3%a5derNSM_v/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";
    const response = await fetch(url);
    if (!response.ok) return;

    const geojson = await response.json();
    const geoJsonLayer = L.geoJSON(geojson, {
      pane: 'nsmPane',
      interactive: mode !== 'routePlanning',
      style: {
        color: '#ff0000',
        weight: 2,
        fillColor: '#ff0000',
        fillOpacity: 0.25,
      },
      onEachFeature: mode !== 'routePlanning' ? (feature, layer) => {
        const props = feature?.properties || {};
        const name =
          props.navn || props.NAVN || props.name || props.Name ||
          props.OMR_NAVN || props.OMRNAVN || props.OBJECTID || 'Ukjent område';

        const excludeKeys = ['globalid', 'shape_area', 'shape__area', 'shape_length', 'shape__length', 'shape_lenght', 'objectid', 'refnr', 'length'];
        const details = Object.entries(props)
          .filter(([k, v]) => v !== null && v !== undefined && String(v).trim() !== '' && !excludeKeys.includes(k.trim().toLowerCase()))
          .slice(0, 8)
          .map(([k, v]) => `<div style="font-size: 11px;"><span style="color:#666;">${k}:</span> ${String(v)}</div>`)
          .join('');

        layer.bindPopup(
          `<div>
            <strong>NSM Forbudsområde</strong><br/>
            <span>${String(name)}</span>
            ${details ? `<div style="margin-top:6px;">${details}</div>` : ''}
          </div>`
        );
        attachHoverPromotion(layer, {
          paneName: 'nsmPane',
          baseStyle: { color: '#ff0000', weight: 2, fillColor: '#ff0000', fillOpacity: 0.25 },
        });
      } : undefined,
    });

    if (geoJsonRef) {
      geoJsonRef.current = geoJsonLayer;
    }
    setGeoJsonInteractivity(geoJsonLayer, modeRef.current !== "routePlanning");
    (geoJsonLayer as any).bringToFront?.();
    geoJsonLayer.eachLayer((l: any) => l?.bringToFront?.());

    layer.clearLayers();
    layer.addLayer(geoJsonLayer);
  } catch (err) {
    console.error("Kunne ikke hente NSM Forbudsområder:", err);
  }
}

export async function fetchRpasData(params: GeoJsonFetchParams) {
  const { layer, mode, geoJsonRef, setGeoJsonInteractivity, modeRef } = params;
  try {
    // Hent fra vår egen tabell — synces fra Avinors Dronerestriksjonsomraader_gdb
    // og inneholder kontakt + godkjenningstekst pr. lufthavn.
    const { data, error } = await supabase
      .from("rpas_5km_zones")
      .select("name, geometry, properties");
    if (error || !data) {
      console.error("Kunne ikke hente RPAS 5km soner:", error);
      return;
    }

    const { buildRpas5kmPopupHtml } = await import("@/lib/rpas5kmPopup");

    const features = data
      .filter((row: any) => row.geometry)
      .map((row: any) => ({
        type: "Feature" as const,
        geometry: row.geometry,
        properties: { ...(row.properties || {}), __name: row.name },
      }));
    const geojson = { type: "FeatureCollection" as const, features };

    const geoJsonLayer = L.geoJSON(geojson as any, {
      interactive: mode !== "routePlanning",
      pane: "rpasPane",
      style: {
        color: "#f97316",
        weight: 2,
        fillColor: "#f97316",
        fillOpacity: 0.2,
      },
      onEachFeature: mode !== "routePlanning" ? (feature, lyr) => {
        const props = feature.properties || {};
        const popupProps = { ...props };
        if (!popupProps.NAVN && popupProps.__name) popupProps.NAVN = popupProps.__name;
        lyr.bindPopup(buildRpas5kmPopupHtml(popupProps), { maxWidth: 340 });
        attachHoverPromotion(lyr, {
          paneName: "rpasPane",
          baseStyle: { color: "#f97316", weight: 2, fillColor: "#f97316", fillOpacity: 0.2 },
        });
      } : undefined,
    });

    // Bygg dedupe-cache med sentroider for hver Avinor-sone, slik at CAA
    // "flyplasser" + AIP "ATZ" kan hoppe over duplikate 5 km-sirkler for
    // de samme lufthavnene (se isCoveredByAvinorRpas).
    try {
      const centers: Array<{ lat: number; lng: number }> = [];
      geoJsonLayer.eachLayer((l: any) => {
        try {
          const c = l.getBounds?.().getCenter();
          if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
            centers.push({ lat: c.lat, lng: c.lng });
          }
        } catch { /* ignore */ }
      });
      setAvinorRpasCenters(centers);
    } catch { /* ignore */ }

    if (geoJsonRef) {
      geoJsonRef.current = geoJsonLayer;
    }
    setGeoJsonInteractivity(geoJsonLayer, modeRef.current !== "routePlanning");

    layer.clearLayers();
    layer.addLayer(geoJsonLayer);
  } catch (err) {
    console.error("Kunne ikke hente RPAS 5km soner:", err);
  }
}

export async function fetchAllAipZones(params: GeoJsonFetchParams & {
  aipLayer: L.LayerGroup;
  rmzTmzAtzLayer: L.LayerGroup;
}) {
  const { aipLayer, rmzTmzAtzLayer, mode, aipGeoJsonLayersRef, setGeoJsonInteractivity, modeRef } = params;
  try {
    const { data, error } = await supabase
      .from('aip_restriction_zones')
      .select('zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry, properties')
      .in('zone_type', ['P', 'R', 'D', 'RMZ', 'TMZ', 'ATZ', 'CTR', 'TIZ'])
      .eq('is_official', true);

    if (error || !data) {
      console.error('Feil ved henting av AIP-soner:', error);
      return;
    }

    aipLayer.clearLayers();
    rmzTmzAtzLayer.clearLayers();
    if (aipGeoJsonLayersRef) {
      aipGeoJsonLayersRef.current = [];
    }

    const prdTypes = new Set(['P', 'R', 'D']);

    for (const zone of data) {
      if (!zone.geometry) continue;

      const isPRD = prdTypes.has(zone.zone_type);
      let color: string;
      let label: string;
      let dashArray: string | undefined;
      let fillOpacity: number;
      let pane: string;
      let targetLayer: L.LayerGroup;

      if (zone.zone_type === 'P') {
        color = '#dc2626'; label = 'Forbudsområde'; fillOpacity = 0.2; pane = 'aipPane'; targetLayer = aipLayer;
      } else if (zone.zone_type === 'R') {
        color = '#8b5cf6'; label = 'Restriksjonsområde'; fillOpacity = 0.2; pane = 'aipPane'; targetLayer = aipLayer;
      } else if (zone.zone_type === 'D') {
        color = '#f59e0b'; label = 'Fareområde'; dashArray = '5, 5'; fillOpacity = 0.2; pane = 'aipPane'; targetLayer = aipLayer;
      } else if (zone.zone_type === 'TMZ') {
        color = '#06b6d4'; label = 'TMZ (Transponder Mandatory Zone)'; dashArray = '8, 6'; fillOpacity = 0.12; pane = 'rmzPane'; targetLayer = rmzTmzAtzLayer;
      } else if (zone.zone_type === 'ATZ') {
        color = '#f59e0b'; label = 'Småflyplass — 5 km sone'; fillOpacity = 0.12; pane = 'atzPane'; targetLayer = rmzTmzAtzLayer;
      } else if (zone.zone_type === 'CTR') {
        color = '#ec4899'; label = 'CTR (Control Zone)'; fillOpacity = 0.12; pane = 'rmzPane'; targetLayer = rmzTmzAtzLayer;
      } else if (zone.zone_type === 'TIZ') {
        color = '#a78bfa'; label = 'TIZ (Traffic Information Zone)'; dashArray = '8, 6'; fillOpacity = 0.12; pane = 'rmzPane'; targetLayer = rmzTmzAtzLayer;
      } else {
        // RMZ default
        color = '#22c55e'; label = 'RMZ (Radio Mandatory Zone)'; dashArray = '8, 6'; fillOpacity = 0.12; pane = 'rmzPane'; targetLayer = rmzTmzAtzLayer;
      }

      try {
        const geojsonFeature = {
          type: 'Feature' as const,
          geometry: zone.geometry,
          properties: {
            zone_id: zone.zone_id,
            zone_type: zone.zone_type,
            name: zone.name,
            upper_limit: zone.upper_limit,
            lower_limit: zone.lower_limit,
            remarks: zone.remarks,
          }
        };

        // ATZ småflyplasser tegnes som 5 km sirkel rundt sentroide
        // (PPR — kontakt flyplassen før flyging via myppr.no).
        if (zone.zone_type === 'ATZ') {
          const tmpGeo = L.geoJSON(geojsonFeature as any);
          const center = tmpGeo.getBounds().getCenter();
          // Dedupe: hopp over hvis Avinor RPAS allerede dekker denne lufthavnen
          if (isCoveredByAvinorRpas(center.lat, center.lng)) continue;
          const displayName = zone.name || zone.zone_id || 'Ukjent småflyplass';
          let popup = `<strong>${label}</strong><br/>`;
          popup += `<strong>${displayName}</strong><br/>`;
          popup += `<div style="font-size: 12px; margin-top: 4px;">Kontakt flyplassen før flyging — <a href="https://myppr.no" target="_blank" rel="noopener noreferrer">myppr.no</a></div>`;
          const circle = L.circle(center, {
            radius: 5000,
            interactive: mode !== 'routePlanning',
            pane,
            color,
            weight: 2,
            fillColor: color,
            fillOpacity,
          });
          if (mode !== 'routePlanning') {
            circle.bindPopup(popup);
            attachHoverPromotion(circle as unknown as L.Path, {
              paneName: pane,
              baseStyle: { color, weight: 2, fillColor: color, fillOpacity },
            });
          }
          circle.addTo(targetLayer);
          continue;
        }

        const geoJsonLayer = L.geoJSON(geojsonFeature as any, {
          interactive: mode !== 'routePlanning',
          pane,
          style: {
            color,
            weight: 2,
            fillColor: color,
            fillOpacity,
            dashArray,
          },
          onEachFeature: mode !== 'routePlanning' ? (feature, layer) => {
            const p = feature.properties || {};
            const displayName = p.name || p.zone_id || 'Ukjent';
            let popup = `<strong>${label}</strong><br/>`;
            popup += `<strong>${displayName}</strong><br/>`;
            if (p.upper_limit) popup += `Øvre grense: ${p.upper_limit}<br/>`;
            if (p.lower_limit) popup += `Nedre grense: ${p.lower_limit}<br/>`;
            if (p.remarks) popup += `<div style="font-size: 11px; margin-top: 4px; color: #666;">${p.remarks}</div>`;
            layer.bindPopup(popup);
            attachHoverPromotion(layer, {
              paneName: pane,
              baseStyle: { color, weight: 2, fillColor: color, fillOpacity, dashArray },
            });
          } : undefined,
        });
        geoJsonLayer.addTo(targetLayer);
        if (aipGeoJsonLayersRef) {
          aipGeoJsonLayersRef.current.push(geoJsonLayer);
        }
        if (modeRef.current === 'routePlanning') {
          setGeoJsonInteractivity(geoJsonLayer, false);
        }
      } catch (err) {
        console.error(`Feil ved parsing av AIP-sone ${zone.zone_id}:`, err);
      }
    }
  } catch (err) {
    console.error('Kunne ikke hente AIP-soner:', err);
  }
}

export async function fetchObstacles(params: FetchParams) {
  const { layer, mode } = params;
  try {
    const { data, error } = await supabase
      .from('openaip_obstacles')
      .select('openaip_id, name, type, geometry, elevation, height_agl, properties');

    if (error || !data) {
      console.error('Feil ved henting av hindringer:', error);
      return;
    }

    layer.clearLayers();

    for (const obstacle of data) {
      if (!obstacle.geometry) continue;

      try {
        const geom = obstacle.geometry as any;
        let lat: number, lng: number;
        
        if (geom.coordinates) {
          [lng, lat] = geom.coordinates;
        } else {
          continue;
        }

        const obstacleIcon = L.divIcon({
          className: '',
          html: `<div style="
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#ef4444" stroke="#991b1b" stroke-width="1.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13" stroke="white" stroke-width="2"/>
              <line x1="12" y1="17" x2="12.01" y2="17" stroke="white" stroke-width="2"/>
            </svg>
          </div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
          popupAnchor: [0, -10],
        });

        const marker = L.marker([lat, lng], { icon: obstacleIcon, interactive: mode !== 'routePlanning', pane: 'obstaclePane' });
        
        const typeName = obstacle.type || 'Ukjent';
        const displayName = obstacle.name || typeName;
        let popup = `<strong>⚠️ Hindring</strong><br/>`;
        popup += `<strong>${displayName}</strong><br/>`;
        popup += `Type: ${typeName}<br/>`;
        if (obstacle.elevation) popup += `Høyde (MSL): ${obstacle.elevation} m<br/>`;
        if (obstacle.height_agl) popup += `Høyde (AGL): ${obstacle.height_agl} m<br/>`;
        marker.bindPopup(popup);
        
        marker.addTo(layer);
      } catch (err) {
        // Skip individual obstacles that fail
      }
    }
  } catch (err) {
    console.error('Kunne ikke hente hindringer:', err);
  }
}

export async function fetchAirportsData(params: FetchParams) {
  const { layer, mode } = params;
  try {
    const url = "https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/FlyplassInfo_PROD/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";
    const response = await fetch(url);
    if (!response.ok) return;
    
    const geojson = await response.json();
   
    const coordinateFixes: Record<string, [number, number]> = {
      'ENKJ': [11.0364, 59.9753],
    };
   
    if (geojson.features) {
      geojson.features = geojson.features.map((feature: any) => {
        const icao = feature.properties?.ICAO || feature.properties?.icao;
        if (icao && coordinateFixes[icao] && feature.geometry?.coordinates) {
          feature.geometry.coordinates = coordinateFixes[icao];
        }
        return feature;
      });
    }
   
    const geoJsonLayer = L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => {
        const icon = L.icon({
          iconUrl: airportIcon,
          iconSize: [32, 40],
          iconAnchor: [16, 40],
          popupAnchor: [0, -40]
        });
        return L.marker(latlng, { icon, interactive: mode !== 'routePlanning', pane: 'airportPane' });
      },
      onEachFeature: mode !== 'routePlanning' ? (feature, layer) => {
        if (feature.properties) {
          const props = feature.properties;
          const icao = props.ICAO || props.icao || '';
          const iata = props.IATA || props.iata || '';
          const name = props.NAVN || props.navn || props.name || props.Name || icao || 'Flyplass';
          
          let popupContent = `<strong>${name}</strong>`;
          if (icao) popupContent += `<br/>ICAO: ${icao}`;
          if (iata) popupContent += `<br/>IATA: ${iata}`;
          
          layer.bindPopup(popupContent);
        }
      } : undefined
    });
    
    layer.clearLayers();
    layer.addLayer(geoJsonLayer);
  } catch (err) {
    console.error("Kunne ikke hente flyplasser:", err);
  }
}

export async function fetchAndDisplayMissions(params: {
  missionsLayer: L.LayerGroup;
  completedMissionsLayer?: L.LayerGroup;
  modeRef: React.MutableRefObject<string>;
  onMissionClickRef: React.MutableRefObject<((mission: any) => void) | undefined>;
}) {
  const { missionsLayer, completedMissionsLayer, modeRef, onMissionClickRef } = params;
  if (modeRef.current !== "view") return;
  
  try {
    const { data: missions, error } = await supabase
      .from("missions")
      .select("*")
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    if (error) return;
    
    missionsLayer.clearLayers();
    completedMissionsLayer?.clearLayers();

    missions?.forEach((mission) => {
      if (!mission.latitude || !mission.longitude) return;

      const isCompleted = mission.status === 'Fullført';

      let markerColor = '#3b82f6';
      if (mission.status === 'Pågående') markerColor = '#eab308';
      else if (isCompleted) markerColor = '#6b7280';
      
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${markerColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3" fill="${markerColor}"/>
          </svg>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });

      const marker = L.marker([mission.latitude, mission.longitude], { icon, pane: 'missionPane' });
      marker.on('click', () => {
        onMissionClickRef.current?.(mission);
      });

      // Add completed missions to separate layer if available, otherwise to main layer
      if (isCompleted && completedMissionsLayer) {
        marker.addTo(completedMissionsLayer);
      } else {
        marker.addTo(missionsLayer);
      }
    });
  } catch (err) {
    console.error("Feil ved henting av oppdrag:", err);
  }
}

function escapePlannedHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatPlannedDateNo(d?: string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleString("no-NO", { dateStyle: "short", timeStyle: "short" });
}


export async function fetchAndDisplayPlannedMissionPublications(params: {
  layer: L.LayerGroup;
  modeRef: React.MutableRefObject<string>;
  /** Window in hours from now. Default 24. */
  windowHours?: number;
}) {
  const { layer, modeRef, windowHours = 24 } = params;
  if (modeRef.current !== "view") return;

  const now = new Date();
  const until = new Date(now.getTime() + windowHours * 3600 * 1000);

  try {
    const { data, error } = await (supabase as any)
      .from("v_planned_mission_map")
      .select("*")
      // Only show missions still in planned state — once live/completed/cancelled, hide from planned layer
      .eq("status", "Planlagt")
      // Show items whose visibility window overlaps the [now, now+window] range
      .lte("starts_at", until.toISOString())
      .gte("ends_at", now.toISOString());

    if (error) {
      console.warn("Planned missions fetch error:", error.message);
      return;
    }

    layer.clearLayers();

    // Collect polygons (with time window) for overlap detection
    type PolyEntry = {
      clip: ClipPolygon | ClipMultiPolygon;
      starts: number;
      ends: number;
      bounds: L.LatLngBounds;
    };
    const polyEntries: PolyEntry[] = [];

    const toClipGeom = (geom: any): ClipPolygon | ClipMultiPolygon | null => {
      if (!geom) return null;
      if (geom.type === "Polygon") return geom.coordinates as ClipPolygon;
      if (geom.type === "MultiPolygon") return geom.coordinates as ClipMultiPolygon;
      return null;
    };

    (data || []).forEach((row: any) => {
      const anon = !!row.anonymous_publish;
      const share = !!row.share_contact_info;
      const showContact = share && !anon;

      const title = escapePlannedHtml(
        row.public_title || (anon ? "Planlagt droneoppdrag" : "Planlagt oppdrag")
      );
      const desc = row.public_description ? escapePlannedHtml(row.public_description) : "";
      // Detect if ends_at is the trigger's 24h fallback (start + 24h, exact)
      const startMs = new Date(row.starts_at).getTime();
      const endMs = row.ends_at ? new Date(row.ends_at).getTime() : NaN;
      const isFallbackEnd =
        Number.isFinite(endMs) && Math.abs(endMs - startMs - 24 * 3600 * 1000) < 60_000;
      const period = isFallbackEnd
        ? `${formatPlannedDateNo(row.starts_at)} – (ukjent sluttid)`
        : `${formatPlannedDateNo(row.starts_at)} – ${formatPlannedDateNo(row.ends_at)}`;
      const companyName = !anon && row.public_company_name ? escapePlannedHtml(row.public_company_name) : "";
      const missionType = !anon && row.public_mission_type ? escapePlannedHtml(row.public_mission_type) : "";

      const contactRows: string[] = [];
      if (showContact) {
        if (row.public_contact_name) {
          contactRows.push(
            `<div style="font-size:12px;"><strong>Kontakt:</strong> ${escapePlannedHtml(row.public_contact_name)}</div>`
          );
        }
        if (row.public_contact_phone) {
          contactRows.push(
            `<a href="tel:${escapePlannedHtml(row.public_contact_phone)}" style="display:inline-block;margin-right:8px;font-size:12px;color:#2563eb;text-decoration:underline;">📞 ${escapePlannedHtml(row.public_contact_phone)}</a>`
          );
        }
        if (row.public_contact_email) {
          contactRows.push(
            `<a href="mailto:${escapePlannedHtml(row.public_contact_email)}" style="display:inline-block;font-size:12px;color:#2563eb;text-decoration:underline;">✉️ ${escapePlannedHtml(row.public_contact_email)}</a>`
          );
        }
      } else {
        contactRows.push(`<div style="font-size:11px;color:#6b7280;font-style:italic;">Operatør har valgt anonym publisering.</div>`);
      }

      const popupHtml = `
        <div style="min-width:220px;max-width:280px;font-family:inherit;">
          <div style="font-weight:700;font-size:13px;margin-bottom:4px;">${title}</div>
          ${companyName ? `<div style="font-size:12px;color:#374151;margin-bottom:2px;"><strong>${companyName}</strong></div>` : ""}
          ${missionType ? `<div style="display:inline-block;font-size:11px;color:#1e40af;background:#dbeafe;padding:2px 8px;border-radius:9999px;margin-bottom:6px;">${missionType}</div>` : ""}
          <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">${escapePlannedHtml(period)}</div>
          ${desc ? `<div style="font-size:12px;margin-bottom:8px;white-space:pre-wrap;">${desc}</div>` : ""}
          <div style="margin-top:6px;padding-top:6px;border-top:1px solid #e5e7eb;display:flex;flex-direction:column;gap:4px;">
            ${contactRows.join("")}
          </div>
        </div>
      `;

      const color = "#2563eb";

      // Polygon
      try {
        const geom = row.geometry_geojson;
        if (geom && (geom.type === "Polygon" || geom.type === "MultiPolygon")) {
          const gj = L.geoJSON(geom as any, {
            style: {
              color,
              weight: 2,
              opacity: 0.9,
              fillColor: color,
              fillOpacity: 0.15,
              dashArray: "4 4",
            },
            pane: "missionPane",
          });
          gj.bindPopup(popupHtml, { maxWidth: 320 });
          gj.addTo(layer);

          // Track for overlap detection
          const clip = toClipGeom(geom);
          if (clip) {
            const starts = row.starts_at ? new Date(row.starts_at).getTime() : now.getTime();
            const ends = row.ends_at ? new Date(row.ends_at).getTime() : until.getTime();
            polyEntries.push({ clip, starts, ends, bounds: gj.getBounds() });
          }
        }
      } catch (e) {
        console.warn("Planned mission polygon render failed:", e);
      }

      // Center marker — stationary drone icon for planned missions
      const center = row.center_geojson;
      if (center?.type === "Point" && Array.isArray(center.coordinates)) {
        const [lng, lat] = center.coordinates as [number, number];
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:70px;height:70px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
            <img src="${droneStaticIcon}" style="width:70px;height:70px;object-fit:contain;" alt="Planlagt drone" />
          </div>`,
          iconSize: [70, 70],
          iconAnchor: [35, 35],
          popupAnchor: [0, -35],
        });
        L.marker([lat, lng], { icon, pane: "missionPane" })
          .bindPopup(popupHtml, { maxWidth: 320 })
          .addTo(layer);
      }
    });

    // Compute pairwise overlaps (geometric AND temporal) and render as warning layer
    try {
      const overlapPieces: ClipMultiPolygon = [];
      for (let i = 0; i < polyEntries.length; i++) {
        for (let j = i + 1; j < polyEntries.length; j++) {
          const a = polyEntries[i];
          const b = polyEntries[j];
          // Time overlap check
          if (!(a.starts < b.ends && b.starts < a.ends)) continue;
          // Bounding box pre-filter
          if (!a.bounds.intersects(b.bounds)) continue;
          try {
            const inter = polygonClipping.intersection(
              a.clip as ClipPolygon,
              b.clip as ClipPolygon,
            );
            if (inter && inter.length) {
              for (const poly of inter) overlapPieces.push(poly);
            }
          } catch (e) {
            // Ignore individual pair failures
          }
        }
      }

      if (overlapPieces.length) {
        const overlapGeoJSON = {
          type: "MultiPolygon",
          coordinates: overlapPieces,
        } as GeoJSON.MultiPolygon;
        const warnColor = "#dc2626";
        const overlapLayer = L.geoJSON(overlapGeoJSON as any, {
          style: {
            color: warnColor,
            weight: 1.5,
            opacity: 0.9,
            fillColor: warnColor,
            fillOpacity: 0.35,
          },
          pane: "missionPane",
          interactive: false,
        });
        overlapLayer.bindTooltip("Overlappende planlagte områder – sjekk konflikter", {
          sticky: true,
          direction: "top",
        });
        overlapLayer.addTo(layer);
      }
    } catch (e) {
      console.warn("Overlap rendering failed:", e);
    }
  } catch (err) {
    console.error("Feil ved henting av planlagte publiserte oppdrag:", err);
  }
}

export async function fetchDroneTelemetry(params: {
  droneLayer: L.LayerGroup;
  modeRef: React.MutableRefObject<string>;
}) {
  const { droneLayer, modeRef } = params;
  try {
    const { data: telemetry, error } = await supabase
      .from('drone_telemetry')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !telemetry) return;

    droneLayer.clearLayers();

    const latestByDrone = new Map<string, typeof telemetry[0]>();
    telemetry.forEach(t => {
      const droneId = t.drone_id || 'unknown';
      if (!latestByDrone.has(droneId)) {
        latestByDrone.set(droneId, t);
      }
    });

    // Hent dronemetadata + aktive flights for kilde-merking
    const droneIds = Array.from(latestByDrone.keys()).filter(id => id !== 'unknown');
    const droneInfoById = new Map<string, { modell?: string | null; registration_number?: string | null }>();
    const dronetagDroneIds = new Set<string>();
    if (droneIds.length > 0) {
      const [{ data: drones }, { data: activeFlights }] = await Promise.all([
        supabase.from('drones').select('id, modell, registration_number').in('id', droneIds),
        supabase.from('active_flights').select('drone_id, dronetag_device_id').in('drone_id', droneIds),
      ]);
      (drones || []).forEach(d => droneInfoById.set(d.id, d));
      (activeFlights || []).forEach(f => {
        if (f.drone_id && f.dronetag_device_id) dronetagDroneIds.add(f.drone_id);
      });
    }

    latestByDrone.forEach((t, droneId) => {
      if (!t.lat || !t.lon) return;

      const icon = L.divIcon({
        className: '',
        html: `<img src="${droneAnimatedIcon}" style="width:70px;height:70px;" />`,
        iconSize: [70, 70],
        iconAnchor: [35, 35],
        popupAnchor: [0, -35],
      });

      const marker = L.marker([t.lat, t.lon], {
        icon,
        interactive: modeRef.current !== 'routePlanning',
        pane: 'liveFlightPane'
      });

      const droneInfo = droneInfoById.get(droneId);
      const isDronetag = dronetagDroneIds.has(droneId);
      const rawSource = (t as any).raw?.source as string | undefined;
      const isFlightHub2 = rawSource === 'flighthub2';
      const callsign = droneInfo?.registration_number || droneInfo?.modell || droneId;

      const sourceKind: 'avisafe-flighthub2' | 'avisafe-dronetag' | 'avisafe' =
        isFlightHub2 ? 'avisafe-flighthub2' : (isDronetag ? 'avisafe-dronetag' : 'avisafe');

      marker.bindPopup(
        renderTrafficPopup({
          callsign,
          beaconType: 'UAV',
          aircraftModel: droneInfo?.modell,
          registration: droneInfo?.registration_number,
          altitudeM: t.alt,
          updatedAt: t.created_at,
          source: { kind: sourceKind },
        }),
        { autoPan: false, keepInView: false }
      );
      marker.addTo(droneLayer);
    });
  } catch (err) {
    console.error('Feil ved henting av dronetelemetri:', err);
  }
}

export async function fetchActiveAdvisories(params: {
  activeAdvisoryLayer: L.LayerGroup;
  flightMarkersRef: React.MutableRefObject<Map<string, L.Marker>>;
}) {
  const { activeAdvisoryLayer, flightMarkersRef } = params;
  try {
    const { data: activeFlights, error } = await supabase
      .from('active_flights')
      .select('id, mission_id, drone_id, publish_mode, route_data, start_time')
      .eq('publish_mode', 'advisory');

    if (error) {
      console.error('Error fetching active advisories:', error);
      return;
    }

    activeAdvisoryLayer.clearLayers();
    for (const [key] of flightMarkersRef.current) {
      if (key.startsWith('advisory_')) flightMarkersRef.current.delete(key);
    }

    // Hent oppdrag- og dronemetadata
    const missionIds = Array.from(new Set((activeFlights || []).map(f => f.mission_id).filter(Boolean))) as string[];
    const droneIds = Array.from(new Set((activeFlights || []).map(f => f.drone_id).filter(Boolean))) as string[];
    const missionById = new Map<string, { tittel?: string | null }>();
    const droneById = new Map<string, { modell?: string | null; registration_number?: string | null }>();
    if (missionIds.length > 0) {
      const { data } = await supabase.from('missions').select('id, tittel').in('id', missionIds);
      (data || []).forEach(m => missionById.set(m.id, m));
    }
    if (droneIds.length > 0) {
      const { data } = await supabase.from('drones').select('id, modell, registration_number').in('id', droneIds);
      (data || []).forEach(d => droneById.set(d.id, d));
    }

    for (const flight of activeFlights || []) {
      const route = flight.route_data as any;
      if (!route?.coordinates || route.coordinates.length < 3) continue;

      const polygonCoords = route.coordinates.map((p: any) => [p.lat, p.lng] as [number, number]);

      const polygon = L.polygon(polygonCoords, {
        color: '#10b981',
        weight: 2,
        fillColor: '#10b981',
        fillOpacity: 0.25,
        interactive: true,
      });

      const mission = flight.mission_id ? missionById.get(flight.mission_id) : undefined;
      const drone = flight.drone_id ? droneById.get(flight.drone_id) : undefined;
      const callsign = drone?.registration_number || mission?.tittel || 'Aktiv flytur';

      const popupHtml = renderTrafficPopup({
        callsign,
        beaconType: 'UAV',
        aircraftModel: drone?.modell,
        registration: drone?.registration_number,
        updatedAt: flight.start_time,
        source: { kind: 'avisafe-advisory' },
      });

      polygon.bindPopup(popupHtml);
      polygon.addTo(activeAdvisoryLayer);

      const centLat = polygonCoords.reduce((s: number, c: [number, number]) => s + c[0], 0) / polygonCoords.length;
      const centLng = polygonCoords.reduce((s: number, c: [number, number]) => s + c[1], 0) / polygonCoords.length;
      const droneIcon = L.divIcon({
        className: '',
        html: `<img src="${droneAnimatedIcon}" style="width:70px;height:70px;" />`,
        iconSize: [70, 70],
        iconAnchor: [35, 35],
        popupAnchor: [0, -35],
      });
      const centroidMarker = L.marker([centLat, centLng], {
        icon: droneIcon,
        interactive: true,
        pane: 'liveFlightPane'
      });
      centroidMarker.bindPopup(popupHtml);
      centroidMarker.addTo(activeAdvisoryLayer);
      flightMarkersRef.current.set(flight.id, centroidMarker as any);
    }
  } catch (err) {
    console.error('Error fetching active advisories:', err);
  }
}

export interface BoundsFetchParams extends FetchParams {
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number };
}

export async function fetchNaturvernZones(params: BoundsFetchParams) {
  const { layer, mode, bounds } = params;
  const cache = getCache('naturvern');
  if (bboxCovered(cache.cachedBounds, bounds)) return;
  const padded = padBBox(bounds);
  try {
    const { data, error } = await supabase.rpc('get_naturvern_in_bounds', {
      min_lat: padded.minLat,
      min_lng: padded.minLng,
      max_lat: padded.maxLat,
      max_lng: padded.maxLng,
    });

    if (error || !data) {
      console.error('Feil ved henting av naturvernområder:', error);
      return;
    }

    const verneformColors: Record<string, string> = {
      'Nasjonalpark': '#15803d',
      'Naturreservat': '#166534',
      'Landskapsvernområde': '#4ade80',
      'Biotopvernområde': '#22c55e',
      'Marint verneområde': '#0ea5e9',
      'Dyrefredningsområde': '#a3e635',
      'Plantefredningsområde': '#84cc16',
    };

    diffRender(
      layer,
      cache,
      (data as any[]).filter((z) => z?.geometry),
      (z) => hashString(`nv|${z.name ?? ''}|${z.verneform ?? ''}|${JSON.stringify(z.geometry)}`),
      (zone) => {
        const color = verneformColors[zone.verneform || ''] || '#16a34a';
        return L.geoJSON({ type: 'Feature' as const, geometry: zone.geometry, properties: { name: zone.name, verneform: zone.verneform } } as any, {
          interactive: mode !== 'routePlanning',
          pane: 'overlayPane',
          style: { color, weight: 1.5, fillColor: color, fillOpacity: 0.15 },
          onEachFeature: mode !== 'routePlanning' ? (feature, lyr) => {
            const p = feature.properties || {};
            let popup = `<strong>🌿 Naturvernområde</strong><br/>`;
            popup += `<strong>${p.name || 'Ukjent'}</strong><br/>`;
            if (p.verneform) popup += `Verneform: ${p.verneform}<br/>`;
            lyr.bindPopup(popup);
            attachHoverPromotion(lyr, {
              paneName: 'overlayPane',
              baseStyle: { color, weight: 1.5, fillColor: color, fillOpacity: 0.15 },
            });
          } : undefined,
        });
      },
    );
    cache.cachedBounds = padded;
  } catch (err) {
    console.error('Kunne ikke hente naturvernområder:', err);
  }
}

export async function fetchVernRestrictionZones(params: BoundsFetchParams) {
  const { layer, mode, bounds } = params;
  const cache = getCache('vernRestriction');
  if (bboxCovered(cache.cachedBounds, bounds)) return;
  const padded = padBBox(bounds);
  try {
    const { data, error } = await supabase.rpc('get_vern_restrictions_in_bounds', {
      min_lat: padded.minLat,
      min_lng: padded.minLng,
      max_lat: padded.maxLat,
      max_lng: padded.maxLng,
    });

    if (error || !data) {
      console.error('Feil ved henting av vern-restriksjoner:', error);
      return;
    }

    const restrictionColors: Record<string, string> = {
      'FERDSELSFORBUD': '#dc2626',
      'LANDINGSFORBUD': '#f97316',
      'LAVFLYVING': '#eab308',
    };
    const restrictionLabels: Record<string, string> = {
      'FERDSELSFORBUD': 'Ferdselsforbud',
      'LANDINGSFORBUD': 'Landingsforbud',
      'LAVFLYVING': 'Lavflyvingsforbud under 300m',
    };

    diffRender(
      layer,
      cache,
      (data as any[]).filter((z) => z?.geometry),
      (z) => hashString(`vr|${z.name ?? ''}|${z.restriction_type ?? ''}|${JSON.stringify(z.geometry)}`),
      (zone) => {
        const color = restrictionColors[zone.restriction_type || ''] || '#ef4444';
        const label = restrictionLabels[zone.restriction_type || ''] || zone.restriction_type || 'Restriksjon';
        return L.geoJSON({ type: 'Feature' as const, geometry: zone.geometry, properties: { name: zone.name, restriction_type: zone.restriction_type } } as any, {
          interactive: mode !== 'routePlanning',
          pane: 'overlayPane',
          style: { color, weight: 2, fillColor: color, fillOpacity: 0.2, dashArray: '5, 5' },
          onEachFeature: mode !== 'routePlanning' ? (feature, lyr) => {
            const p = feature.properties || {};
            let popup = `<strong>⛔ ${label}</strong><br/>`;
            popup += `<strong>${p.name || 'Ukjent'}</strong>`;
            lyr.bindPopup(popup);
            attachHoverPromotion(lyr, {
              paneName: 'overlayPane',
              baseStyle: { color, weight: 2, fillColor: color, fillOpacity: 0.2, dashArray: '5, 5' },
            });
          } : undefined,
        });
      },
    );
    cache.cachedBounds = padded;
  } catch (err) {
    console.error('Kunne ikke hente vern-restriksjoner:', err);
  }
}

// ---- CAA drone zones (dronesoner.no via caa_drone_zones table) ----
import {
  CAA_LAYER_STYLES as CAA_POPUP_STYLES,
  DK_LAYER_STYLES as DK_POPUP_STYLES,
  buildCaaZonePopupHtml,
  buildCaaSmallAirportPopupHtml,
  buildDkZonePopupHtml,
} from './zonePopups';

export type CaaLayerStyle = (typeof CAA_POPUP_STYLES)[string];

const CAA_LAYER_STYLES = CAA_POPUP_STYLES;

export async function fetchCaaDroneZones(params: BoundsFetchParams & {
  layerIds: string[];
}) {
  const { layer, mode, bounds, layerIds } = params;
  if (!layerIds.length) return;
  const cacheKey = `caa:${layerIds.slice().sort().join(',')}`;
  const cache = getCache(cacheKey);
  if (bboxCovered(cache.cachedBounds, bounds)) return;
  const padded = padBBox(bounds);
  try {
    const { data, error } = await supabase.rpc('get_caa_zones_in_bounds', {
      min_lat: padded.minLat,
      min_lng: padded.minLng,
      max_lat: padded.maxLat,
      max_lng: padded.maxLng,
      p_layer_ids: layerIds,
    });
    if (error || !data) {
      if (error) console.error('Feil ved henting av CAA dronesoner:', error);
      return;
    }
    diffRender(
      layer,
      cache,
      (data as any[]).filter((z) => z?.geometry),
      (z) => hashString(`caa|${z.layer_id ?? ''}|${z.name ?? ''}|${JSON.stringify(z.geometry)}`),
      (zone) => {
        const style = CAA_LAYER_STYLES[zone.layer_id] || { color: '#dc2626', iconLabel: '⚠️ Sone' };
        const isWarning = zone.restriction === 'REQ_AUTHORISATION';

        // Småflyplasser (faste fly) tegnes som 5 km sirkel rundt sentroide — kontakt flyplassen/myppr.no.
        // Helikopterplasser holdes som ordinære små markører (default rendering nedenfor).
        const caaType = String(zone?.properties?.type ?? '').toLowerCase();
        if (zone.layer_id === 'flyplasser' && caaType === 'fly') {
          try {
            const tmp = L.geoJSON({ type: 'Feature' as const, geometry: zone.geometry, properties: {} } as any);
            const center = tmp.getBounds().getCenter();
            // Dedupe: Avinor RPAS 5km-soner har autoritativ NINOX-info for
            // de ~50 Avinor-lufthavnene. Hopp over CAA-sirkelen for samme
            // flyplass slik at vi ikke får dobbel sirkel (f.eks. Notodden).
            if (isCoveredByAvinorRpas(center.lat, center.lng)) return null;
            const circle = L.circle(center, {
              radius: 5000,
              color: '#f59e0b',
              weight: 2,
              fillColor: '#f59e0b',
              fillOpacity: 0.12,
              pane: 'atzPane',
              interactive: mode !== 'routePlanning',
              bubblingMouseEvents: false,
            });
            if (mode !== 'routePlanning') {
              circle.bindPopup(buildCaaSmallAirportPopupHtml(zone));
              attachHoverPromotion(circle as unknown as L.Path, {
                paneName: 'atzPane',
                baseStyle: { color: '#f59e0b', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.12 },
              });
            }
            return circle;
          } catch {
            // fallthrough to default rendering
          }
        }

        return L.geoJSON({ type: 'Feature' as const, geometry: zone.geometry, properties: zone } as any, {
          interactive: mode !== 'routePlanning',
          pane: 'overlayPane',
          style: {
            color: style.color,
            weight: 1.5,
            fillColor: style.color,
            fillOpacity: isWarning ? 0.22 : 0.12,
            dashArray: isWarning ? undefined : '4, 4',
          },
          onEachFeature: mode !== 'routePlanning' ? (feature, lyr) => {
            const p: any = feature.properties || {};
            lyr.bindPopup(buildCaaZonePopupHtml(p));
            attachHoverPromotion(lyr, {
              paneName: 'overlayPane',
              baseStyle: {
                color: style.color,
                weight: 1.5,
                fillColor: style.color,
                fillOpacity: isWarning ? 0.22 : 0.12,
                dashArray: isWarning ? undefined : '4, 4',
              },
            });
          } : undefined,
        });
      },

    );
    cache.cachedBounds = padded;
  } catch (err) {
    console.error('Kunne ikke hente CAA dronesoner:', err);
  }
}

// ---- DK drone zones (Trafikstyrelsen via dk_drone_zones table) ----
const DK_LAYER_STYLES = DK_POPUP_STYLES;

export async function fetchDkDroneZones(params: BoundsFetchParams & {
  layerIds: string[];
}) {
  const { layer, mode, bounds, layerIds } = params;
  if (!layerIds.length) return;
  const cacheKey = `dk:${layerIds.slice().sort().join(',')}`;
  const cache = getCache(cacheKey);
  if (bboxCovered(cache.cachedBounds, bounds)) return;
  const padded = padBBox(bounds);
  try {
    const { data, error } = await supabase.rpc('get_dk_drone_zones_in_bounds', {
      min_lat: padded.minLat,
      min_lng: padded.minLng,
      max_lat: padded.maxLat,
      max_lng: padded.maxLng,
      p_layer_ids: layerIds,
    });
    if (error || !data) {
      if (error) console.error('Feil ved henting av DK dronezoner:', error);
      return;
    }

    diffRender(
      layer,
      cache,
      (data as any[]).filter((z) => z?.geometry),
      (z) => hashString(`dk|${z.layer_id ?? ''}|${z.name ?? ''}|${z.icao ?? ''}|${JSON.stringify(z.geometry)}`),
      (zone) => {
        const style = DK_LAYER_STYLES[zone.layer_id] || { color: '#dc2626', iconLabel: '⚠️ DK sone', warningLevel: 'danger' as const };
        if (zone.geometry_type === 'point') {
          const coords = (zone.geometry as any).coordinates;
          if (!coords || coords.length < 2) return null;
          return L.circleMarker([coords[1], coords[0]], {
            radius: 6,
            color: '#fff',
            weight: 1.5,
            fillColor: style.color,
            fillOpacity: 0.9,
            pane: 'overlayPane',
            interactive: mode !== 'routePlanning',
          }).bindPopup(buildDkZonePopupHtml(zone));
        }
        return L.geoJSON({ type: 'Feature' as const, geometry: zone.geometry, properties: zone } as any, {
          interactive: mode !== 'routePlanning',
          pane: 'overlayPane',
          style: {
            color: style.color,
            weight: 1.5,
            fillColor: style.color,
            fillOpacity: style.warningLevel === 'danger' ? 0.22 : 0.14,
            dashArray: style.warningLevel === 'danger' ? undefined : '4, 4',
          },
          onEachFeature: mode !== 'routePlanning' ? (_f, lyr) => {
            lyr.bindPopup(buildDkZonePopupHtml(zone));
            attachHoverPromotion(lyr, {
              paneName: 'overlayPane',
              baseStyle: {
                color: style.color,
                weight: 1.5,
                fillColor: style.color,
                fillOpacity: style.warningLevel === 'danger' ? 0.22 : 0.14,
                dashArray: style.warningLevel === 'danger' ? undefined : '4, 4',
              },
            });
          } : undefined,
        });
      },
    );
    cache.cachedBounds = padded;
  } catch (err) {
    console.error('Kunne ikke hente DK dronezoner:', err);
  }
}


export async function fetchDkNatureAreas(params: BoundsFetchParams & {
  includeInactive?: boolean;
}) {
  const { layer, mode, bounds, includeInactive = true } = params;
  const cache = getCache('dkNature');
  if (bboxCovered(cache.cachedBounds, bounds)) return;
  const padded = padBBox(bounds);
  try {
    const { data, error } = await supabase.rpc('get_dk_nature_areas_in_bounds', {
      min_lat: padded.minLat,
      min_lng: padded.minLng,
      max_lat: padded.maxLat,
      max_lng: padded.maxLng,
      p_include_inactive: includeInactive,
    });
    if (error || !data) {
      if (error) console.error('Feil ved henting av DK naturområder:', error);
      return;
    }
    const esc = (s: any) =>
      String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[c]!));

    diffRender(
      layer,
      cache,
      (data as any[]).filter((a) => a?.geometry),
      (a) => hashString(`dkn|${a.name ?? ''}|${a.theme ?? ''}|${JSON.stringify(a.geometry)}`),
      (area) => {
        const isActive = area.active !== false;
        const color = isActive ? '#16a34a' : '#9ca3af';
        return L.geoJSON({ type: 'Feature' as const, geometry: area.geometry, properties: area } as any, {
          interactive: mode !== 'routePlanning',
          pane: 'overlayPane',
          style: {
            color,
            weight: 1.5,
            fillColor: color,
            fillOpacity: isActive ? 0.25 : 0.08,
            dashArray: isActive ? undefined : '5, 5',
          },
          onEachFeature: mode !== 'routePlanning' ? (_f, lyr) => {
            let html = `<strong>🌿 Naturområde (DK) ${isActive ? '' : '— inaktiv'}</strong><br/>`;
            html += `<strong>${esc(area.name || 'Ukjent')}</strong>`;
            if (area.theme) html += `<div>${esc(area.theme)}</div>`;
            if (area.restriction_period) html += `<div>Periode: ${esc(area.restriction_period)}</div>`;
            if (area.reason) html += `<div style="margin-top:4px">${esc(area.reason)}</div>`;
            if (area.source_url) html += `<div style="margin-top:4px"><a href="${esc(area.source_url)}" target="_blank" rel="noopener">Mer info</a></div>`;
            html += `<div style="margin-top:4px;font-size:11px;color:#666">Kilde: Trafikstyrelsen</div>`;
            lyr.bindPopup(html);
            attachHoverPromotion(lyr, {
              paneName: 'overlayPane',
              baseStyle: {
                color,
                weight: 1.5,
                fillColor: color,
                fillOpacity: isActive ? 0.25 : 0.08,
                dashArray: isActive ? undefined : '5, 5',
              },
            });
          } : undefined,
        });
      },
    );
    cache.cachedBounds = padded;
  } catch (err) {
    console.error('Kunne ikke hente DK naturområder:', err);
  }
}

export async function fetchPilotPositions(params: {
  pilotPositionsLayer: L.LayerGroup;
  flightMarkersRef: React.MutableRefObject<Map<string, L.Marker>>;
  mode: string;
}) {
  const { pilotPositionsLayer, flightMarkersRef, mode } = params;
  try {
    const { data: liveFlights, error } = await supabase
      .from('active_flights')
      .select('id, start_lat, start_lng, pilot_name, start_time, publish_mode')
      .in('publish_mode', ['live_uav', 'none'])
      .not('start_lat', 'is', null)
      .not('start_lng', 'is', null);
    
    if (error) {
      console.error('Error fetching pilot positions:', error);
      return;
    }
    
    pilotPositionsLayer.clearLayers();
    for (const [key] of flightMarkersRef.current) {
      if (key.startsWith('live_')) flightMarkersRef.current.delete(key);
    }
    
    for (const flight of liveFlights || []) {
      if (!flight.start_lat || !flight.start_lng) continue;
      
      const isInternal = flight.publish_mode === 'none';
      const bgColor = isInternal ? '#6b7280' : '#0ea5e9';
      
      const pilotIcon = L.divIcon({
        className: '',
        html: `<div style="
          width: 32px;
          height: 32px;
          background: ${bgColor};
          border: 3px solid white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1">
            <circle cx="12" cy="7" r="4"/>
            <path d="M5.5 21a9.5 9.5 0 0 1 13 0"/>
          </svg>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16],
      });
      
      const marker = L.marker([flight.start_lat, flight.start_lng], { 
        icon: pilotIcon, 
        interactive: mode !== 'routePlanning',
        pane: 'liveFlightPane'
      });
      
      const startTime = flight.start_time ? new Date(flight.start_time).toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' }) : 'Ukjent';
      const pilotName = flight.pilot_name || 'Ukjent pilot';
      const label = isInternal ? 'Intern flytur' : 'Pilot (live posisjon)';
      
      marker.bindPopup(`
        <div>
          <strong>👤 ${pilotName}</strong><br/>
          <span style="font-size: 11px; color: #666;">${label}</span><br/>
          <span style="font-size: 11px;">Startet: ${startTime}</span>
        </div>
      `);
      
      marker.addTo(pilotPositionsLayer);
      flightMarkersRef.current.set(flight.id, marker);
    }
    
    console.log(`Rendered ${liveFlights?.length || 0} pilot positions`);
  } catch (err) {
    console.error('Error fetching pilot positions:', err);
  }
}

// --- Kraftledninger (NVE) via ArcGIS REST ---

const NVE_BASE = "https://kart.nve.no/enterprise/rest/services/Nettanlegg4/MapServer";



interface KraftLayerDef {
  layerId: number;
  label: string;
  color: string;
  weight: number;
  dashArray?: string;
  minZoom: number;
  maxZoom?: number;
  isPoint?: boolean;
  isPolygon?: boolean;
  fillOpacity?: number;
}

const KRAFT_LAYERS: KraftLayerDef[] = [
  // Polygoner først (rendres under alt annet)
  
  // Linjer
  { layerId: 0, label: "Transmisjonsnett", color: "#2563eb", weight: 3, minZoom: 8 },
  { layerId: 1, label: "Regionalnett", color: "#f97316", weight: 2, minZoom: 8 },
  { layerId: 3, label: "Sjøkabel", color: "#06b6d4", weight: 2, dashArray: "6, 4", minZoom: 11 },
  { layerId: 2, label: "Distribusjonsnett", color: "#eab308", weight: 1.5, minZoom: 13 },
  // Punkter
  { layerId: 5, label: "Transformatorstasjon", color: "#a855f7", weight: 0, minZoom: 11, isPoint: true },
  { layerId: 4, label: "Mast/stolpe", color: "#64748b", weight: 0, minZoom: 16, isPoint: true },
];

const escapePopupHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getFirstProperty = (props: Record<string, unknown>, keys: string[]) => {
  const match = keys.find((key) => props[key] !== null && props[key] !== undefined && String(props[key]).trim() !== "");
  return match ? props[match] : "";
};

const kraftZoomCache = new Map<string, number>();

export async function fetchKraftledningerInBounds(params: {
  layer: L.LayerGroup;
  bounds: L.LatLngBounds;
  zoom: number;
  pane: string;
  mode: string;
}) {
  const { layer, bounds, zoom, pane, mode } = params;

  const bbox = {
    minLat: bounds.getSouth(),
    minLng: bounds.getWest(),
    maxLat: bounds.getNorth(),
    maxLng: bounds.getEast(),
  };

  const cache = getCache('kraft');
  const lastZoom = kraftZoomCache.get('kraft');
  // Skip fetch when viewport is inside cached bbox AND zoom hasn't changed
  // (zoom change toggles which kraft sub-layers are visible)
  if (lastZoom === zoom && bboxCovered(cache.cachedBounds, bbox)) return;

  const padded = padBBox(bbox);
  const sw = L.latLng(padded.minLat, padded.minLng);
  const ne = L.latLng(padded.maxLat, padded.maxLng);
  const envelope = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;

  type FetchedItem = { def: typeof KRAFT_LAYERS[number]; feature: any };
  const items: FetchedItem[] = [];

  const fetches = KRAFT_LAYERS
    .filter(def => zoom >= def.minZoom && (!def.maxZoom || zoom <= def.maxZoom))
    .map(async (def) => {
      try {
        const url = `${NVE_BASE}/${def.layerId}/query?where=1%3D1&geometry=${encodeURIComponent(envelope)}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&f=geojson&resultRecordCount=2000`;
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`[NVE] Layer ${def.layerId} returned HTTP ${res.status} from ${NVE_BASE}`);
          return;
        }
        const geojson = await res.json();
        if (!geojson.features?.length) return;
        for (const f of geojson.features) items.push({ def, feature: f });
      } catch (err) {
        console.error(`Feil ved henting av NVE lag ${def.layerId}:`, err);
      }
    });

  await Promise.all(fetches);

  diffRender(
    layer,
    cache,
    items,
    ({ def, feature }) => {
      const p = feature?.properties || {};
      const fid =
        p.OBJECTID ?? p.objectid ?? p.GLOBALID ?? p.globalid ??
        p.OBJECTID_1 ?? hashString(JSON.stringify(feature?.geometry ?? feature));
      return `k${def.layerId}:${fid}`;
    },
    ({ def, feature }) => L.geoJSON(feature, {
      pane,
      interactive: mode !== "routePlanning",
      style: def.isPoint ? undefined : {
        color: def.color,
        weight: def.weight,
        opacity: def.isPolygon ? 0.5 : 0.85,
        fillColor: def.isPolygon ? def.color : undefined,
        fillOpacity: def.fillOpacity ?? (def.isPolygon ? 0.08 : 0),
        dashArray: def.dashArray,
      },
      pointToLayer: def.isPoint ? (_f, latlng) => {
        return L.circleMarker(latlng, {
          pane,
          radius: def.layerId === 4 ? 3 : 5,
          fillColor: def.color,
          color: "#fff",
          weight: 1,
          fillOpacity: 0.8,
        });
      } : undefined,
      onEachFeature: mode !== "routePlanning" ? (feat, l) => {
        const p = feat.properties || {};
        const details = [
          ["Navn", getFirstProperty(p, ["NAVN", "navn", "Navn", "name", "Name"])],
          ["Eier", getFirstProperty(p, ["EIER", "eier", "Eier", "NETTSELSKAP", "nettselskap"])],
          ["Spenning", getFirstProperty(p, ["SPENNING", "spenning", "Spenning", "SPENNING_KV", "spenning_kv"])],
          ["Type", getFirstProperty(p, ["TYPE", "type", "Type", "NETTNIVA", "NETTNIVÅ", "nettniva", "nettnivå"])],
          ["Status", getFirstProperty(p, ["STATUS", "status", "Status"])],
        ].filter(([, value]) => value !== "");
        const rows = details.map(([label, value]) => {
          const suffix = label === "Spenning" && !String(value).toLowerCase().includes("kv") ? " kV" : "";
          return `<div style="display:grid;grid-template-columns:72px 1fr;gap:8px;font-size:12px;line-height:1.35;padding:2px 0;"><span style="color:#64748b;">${escapePopupHtml(label)}</span><strong style="font-weight:600;overflow-wrap:anywhere;">${escapePopupHtml(value)}${suffix}</strong></div>`;
        }).join("");
        const popup = `<div style="min-width:180px;max-width:280px;"><strong>${escapePopupHtml(def.label)}</strong>${rows ? `<div style="margin-top:6px;">${rows}</div>` : "<br/>Ingen detaljer tilgjengelig"}</div>`;
        l.bindPopup(popup);
      } : undefined,
    }),
  );

  cache.cachedBounds = padded;
  kraftZoomCache.set('kraft', zoom);
}

// --- Live NOTAM ---

export async function fetchNotams(params: {
  layer: L.LayerGroup;
  pane: string;
  pinPane: string;
  mode: string;
}) {
  const { layer, pane, pinPane, mode } = params;

  layer.clearLayers();

  // Dedicated SVG renderer bound to notamPane so vectors live in their own SVG container
  const map = (layer as any)._map as L.Map | null;
  if (!map) return;
  if (!map.getPane(pane)) map.createPane(pane);
  if (!map.getPane(pinPane)) map.createPane(pinPane);

  // Reuse existing renderer if available to avoid orphaned SVG containers
  let notamRenderer: L.SVG;
  if ((layer as any)._notamRenderer && (layer as any)._notamRenderer._map === map) {
    notamRenderer = (layer as any)._notamRenderer;
  } else {
    notamRenderer = L.svg({ pane });
    notamRenderer.addTo(map);
    (layer as any)._notamRenderer = notamRenderer;
  }

  try {
    const { data, error } = await supabase
      .from("notams")
      .select("*")
      .or(`effective_end.gt.${new Date().toISOString()},effective_end_interpretation.in.(PERM,EST),effective_end.is.null`)
      .limit(1000);

    if (error) {
      console.error("[NOTAM] Query error:", error);
      return;
    }

    if (!data || data.length === 0) return;

    for (const notam of data) {
      // Try to render geometry
      if (notam.geometry_geojson) {
        try {
          const geoLayer = L.geoJSON(notam.geometry_geojson as any, {
            pane,
            renderer: notamRenderer,
            interactive: mode !== "routePlanning",
            bubblingMouseEvents: false,
            pointToLayer: (_feature: any, latlng: L.LatLng) => {
              return L.marker(latlng, {
                pane: pinPane,
                interactive: mode !== "routePlanning",
                bubblingMouseEvents: false,
                icon: L.divIcon({
                  className: 'notam-pin-icon',
                  html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
                    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="#e67e22" stroke="#c0392b" stroke-width="1.5"/>
                    <circle cx="14" cy="13" r="6" fill="white" opacity="0.9"/>
                    <text x="14" y="17" text-anchor="middle" font-size="11" font-weight="bold" fill="#e67e22" font-family="Arial,sans-serif">!</text>
                  </svg>`,
                  iconSize: [28, 36] as any,
                  iconAnchor: [14, 36] as any,
                  popupAnchor: [0, -36] as any,
                }),
              });
            },
            style: {
              color: "#e67e22",
              weight: 2,
              fillColor: "#f39c12",
              fillOpacity: 0.15,
              dashArray: "5, 5",
            },
          } as any);

          if (mode !== "routePlanning") {
            geoLayer.bindPopup(buildNotamPopup(notam));
            geoLayer.eachLayer((child) => {
              // Hover-promotion kun på polygon-children (ikke pin-markers i pinPane)
              if (typeof (child as any).setStyle === "function") {
                attachHoverPromotion(child, {
                  paneName: pane,
                  baseStyle: {
                    color: "#e67e22",
                    weight: 2,
                    fillColor: "#f39c12",
                    fillOpacity: 0.15,
                    dashArray: "5, 5",
                  },
                });
              }
            });
          }

          geoLayer.addTo(layer);
          geoLayer.bringToFront();
        } catch {
          // Fallback to center marker
          addNotamCenterMarker(notam, layer, pane, pinPane, mode, notamRenderer);
        }
      } else if (notam.center_lat != null && notam.center_lng != null) {
        addNotamCenterMarker(notam, layer, pane, pinPane, mode, notamRenderer);
      }
    }

    console.log(`[NOTAM] Rendered ${data.length} NOTAMs`);
  } catch (err) {
    console.error("[NOTAM] Error:", err);
  }
}

function addNotamCenterMarker(notam: any, layer: L.LayerGroup, pane: string, pinPane: string, mode: string, renderer?: L.Renderer) {
  if (notam.center_lat == null || notam.center_lng == null) return;

  const isAerodrome = notam.scope === "A";

  let marker: L.Layer;
  if (isAerodrome) {
    // Use a pin icon for aerodrome NOTAMs — pin pane (above airspace areas)
    marker = L.marker([notam.center_lat, notam.center_lng], {
      pane: pinPane,
      interactive: mode !== "routePlanning",
      bubblingMouseEvents: false,
      icon: L.divIcon({
        className: 'notam-pin-icon',
        html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
          <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="#e67e22" stroke="#c0392b" stroke-width="1.5"/>
          <circle cx="14" cy="13" r="6" fill="white" opacity="0.9"/>
          <text x="14" y="17" text-anchor="middle" font-size="11" font-weight="bold" fill="#e67e22" font-family="Arial,sans-serif">!</text>
        </svg>`,
        iconSize: [28, 36] as any,
        iconAnchor: [14, 36] as any,
        popupAnchor: [0, -36] as any,
      }),
    });
  } else {
    // Use circle marker for other NOTAMs without geometry — treat as area, stays on notamPane
    marker = L.circleMarker([notam.center_lat, notam.center_lng], {
      pane,
      renderer,
      radius: 8,
      fillColor: "#f39c12",
      color: "#e67e22",
      weight: 2,
      fillOpacity: 0.6,
      interactive: mode !== "routePlanning",
      bubblingMouseEvents: false,
    });
  }

  if (mode !== "routePlanning") {
    (marker as any).bindPopup(buildNotamPopup(notam));
  }

  (marker as any).addTo(layer);
  if (typeof (marker as any).bringToFront === 'function') {
    (marker as any).bringToFront();
  }
}

function buildNotamPopup(notam: any): string {
  const start = notam.effective_start
    ? new Date(notam.effective_start).toLocaleDateString("no-NO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "–";
  const end = notam.effective_end
    ? new Date(notam.effective_end).toLocaleDateString("no-NO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : notam.effective_end_interpretation === "PERM" ? "PERMANENT" : "Ukjent";

  const qcode = notam.qcode ? `<br/><span style="font-size:10px;color:#888;">Q: ${notam.qcode}</span>` : "";
  const location = notam.location ? `<br/><span style="font-size:11px;">📍 ${notam.location}</span>` : "";
  const flLimits = (notam.minimum_fl != null || notam.maximum_fl != null)
    ? `<br/><span style="font-size:11px;">FL${notam.minimum_fl ?? 0}–FL${notam.maximum_fl ?? "∞"}</span>`
    : "";

  const text = notam.notam_text
    ? `<div style="max-height:150px;overflow-y:auto;font-size:11px;margin-top:4px;white-space:pre-wrap;">${notam.notam_text}</div>`
    : "";

  const geomSource = notam.properties?.geometry_source === "caa-fareomrader"
    ? `<br/><span style="font-size:10px;color:#16a34a;">📐 Geometri: Luftfartstilsynet AIP (fareområde ${notam.properties?.matched_caa_id ?? ""})</span>`
    : "";

  return `<div style="max-width:320px;">
    <strong>⚠️ NOTAM ${notam.series || ""}${notam.number}/${notam.year}</strong>
    ${location}${qcode}${flLimits}${geomSource}
    <br/><span style="font-size:11px;">🕐 ${start} → ${end}</span>
    ${text}
  </div>`;
}

// --- NAIS / AIS skipstrafikk (BarentsWatch) ---

const SHIP_TYPE_NAMES: Record<number, string> = {
  30: "Fiskefartøy",
  31: "Sleping",
  32: "Sleping",
  33: "Mudring",
  34: "Dykking",
  35: "Militær",
  36: "Seilbåt",
  37: "Fritidsfartøy",
  40: "Hurtiggående fartøy",
  50: "Losfartøy",
  51: "SAR",
  52: "Taubåt",
  53: "Havneassistanse",
  55: "Politi",
  58: "Medisinsk",
  60: "Passasjerskip",
  70: "Lasteskip",
  80: "Tankskip",
};

function getShipTypeName(type: number | null): string {
  if (type == null) return "Ukjent";
  // Types are grouped by tens (60-69 = passenger, 70-79 = cargo, etc.)
  const base = Math.floor(type / 10) * 10;
  return SHIP_TYPE_NAMES[type] || SHIP_TYPE_NAMES[base] || `Type ${type}`;
}

function createVesselIcon(cog: number | null, shipType: number | null): L.DivIcon {
  const rotation = cog != null ? cog : 0;
  // Color based on type
  let color = "#2563eb"; // default blue
  const base = shipType != null ? Math.floor(shipType / 10) * 10 : 0;
  if (base === 30) color = "#059669"; // fishing = green
  else if (base === 60) color = "#7c3aed"; // passenger = purple
  else if (base === 70) color = "#d97706"; // cargo = amber
  else if (base === 80) color = "#dc2626"; // tanker = red
  else if (shipType === 35) color = "#475569"; // military = slate
  else if (shipType === 51 || shipType === 52) color = "#ea580c"; // SAR/tug = orange

  return L.divIcon({
    className: "",
    html: `<div style="
      width: 20px; height: 20px;
      display: flex; align-items: center; justify-content: center;
      transform: rotate(${rotation}deg);
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="${color}" stroke="#fff" stroke-width="1">
        <path d="M12 2 L6 20 L12 16 L18 20 Z"/>
      </svg>
    </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
}

export async function fetchAisVesselsInBounds(params: {
  layer: L.LayerGroup;
  bounds: L.LatLngBounds;
  zoom: number;
  pane: string;
  mode: string;
}) {
  const { layer, bounds, zoom, pane, mode } = params;

  if (zoom < 8) {
    // Outside zoom range — clear and reset cache
    resetCache('ais', layer);
    return;
  }

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  try {
    const { data, error } = await supabase.functions.invoke("barentswatch-ais", {
      body: {
        bounds: {
          minLat: sw.lat,
          minLng: sw.lng,
          maxLat: ne.lat,
          maxLng: ne.lng,
        },
      },
    });

    if (error) {
      console.error("[NAIS] Edge function error:", error);
      return;
    }

    const vessels = data?.vessels;
    if (!Array.isArray(vessels)) {
      console.warn("[NAIS] Unexpected response:", data);
      return;
    }

    const cache = getCache('ais');
    const filtered = vessels.filter((v: any) => v && v.lat != null && v.lon != null);
    const seen = new Set<string>();

    for (const v of filtered) {
      const id = String(v.mmsi || `${v.lat.toFixed(4)},${v.lon.toFixed(4)}`);
      seen.add(id);
      const existing = cache.features.get(id) as L.Marker | undefined;
      if (existing) {
        // Reuse marker — just update position + icon orientation
        existing.setLatLng([v.lat, v.lon]);
        existing.setIcon(createVesselIcon(v.cog, v.shipType));
      } else {
        const marker = L.marker([v.lat, v.lon], {
          icon: createVesselIcon(v.cog, v.shipType),
          interactive: mode !== "routePlanning",
          pane,
        });
        const typeName = getShipTypeName(v.shipType);
        const sogKnots = v.sog != null ? `${v.sog.toFixed(1)} kn` : "–";
        const cogDeg = v.cog != null ? `${Math.round(v.cog)}°` : "–";
        const name = v.name || "Ukjent";
        let popup = `<strong>🚢 ${name}</strong><br/>`;
        popup += `MMSI: ${v.mmsi || "–"}<br/>`;
        popup += `Type: ${typeName}<br/>`;
        popup += `Fart: ${sogKnots}<br/>`;
        popup += `Kurs: ${cogDeg}<br/>`;
        if (v.destination) popup += `Dest: ${v.destination}<br/>`;
        marker.bindPopup(popup);
        marker.addTo(layer);
        cache.features.set(id, marker);
      }
    }

    // Remove vessels that disappeared
    for (const [id, lyr] of cache.features) {
      if (!seen.has(id)) {
        try { layer.removeLayer(lyr); } catch { /* ignore */ }
        cache.features.delete(id);
      }
    }
  } catch (err) {
    console.error("[NAIS] Error:", err);
  }
}
