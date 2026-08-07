import L from "leaflet";
import { supabase } from "@/integrations/supabase/client";
import { createUniqueChannel } from "@/lib/realtimeChannel";
import { getBeaconSvgUrl, isAnimatedType, HELI_ANIM_FRAMES, droneAnimatedIcon } from "@/lib/mapIcons";
import { renderTrafficPopup } from "@/lib/mapTrafficPopup";

export interface SafeSkyControls {
  start: () => void;
  stop: () => void;
}

export function createSafeSkyManager(params: {
  safeskyLayer: L.LayerGroup;
  mode: string;
  map?: L.Map;
}) {
  const { safeskyLayer, mode, map } = params;

  // Under denne zoomen er trafikkbildet for tett til å rendre — hopp over henting
  // for å spare rader/CPU når kartet dekker hele Europa.
  const MIN_ZOOM_FOR_TRAFFIC = 6;
  // Padding rundt viewport slik at pan innenfor cachet område ikke trigger refetch.
  const BBOX_PAD = 0.3;

  function currentBBox(): { minLat: number; maxLat: number; minLng: number; maxLng: number } | null {
    if (!map) return null;
    try {
      const b = map.getBounds().pad(BBOX_PAD);
      return {
        minLat: b.getSouth(),
        maxLat: b.getNorth(),
        minLng: b.getWest(),
        maxLng: b.getEast(),
      };
    } catch {
      return null;
    }
  }
  
  const safeskyMarkersCache = new Map<string, L.Marker>();
  const heliAnimIntervals = new Map<string, number>();
  let destroyed = false;
  let consecutiveFailures = 0;
  let consecutiveEmptyResults = 0;
  const MAX_FAILURES_BEFORE_RECONNECT = 3;
  const MAX_EMPTY_BEFORE_REFRESH = 5;
  
  function clearAllHeliIntervals() {
    for (const [, intervalId] of heliAnimIntervals) {
      clearInterval(intervalId);
    }
    heliAnimIntervals.clear();
  }

  function isMarkerAttached(marker: L.Marker): boolean {
    try {
      return !!(marker as any)._map && !!marker.getElement();
    } catch {
      return false;
    }
  }

  function renderSafeSkyBeacons(beacons: any[]) {
    if (destroyed) return;
    const currentIds = new Set<string>();
    console.log(`SafeSky: ${beacons.length} beacons from database`);
    
    for (const beacon of beacons) {
      if (destroyed) return;
      const lat = beacon.latitude;
      const lon = beacon.longitude;
      if (lat == null || lon == null) continue;
      
      const beaconId = beacon.id || `${lat}_${lon}`;
      currentIds.add(beaconId);
      
      const beaconType = beacon.beacon_type || 'UNKNOWN';
      const course = beacon.course || 0;
      const isDrone = beaconType === 'UAV';
      const isHeli = isAnimatedType(beaconType);
      
      const altitudeMetersForColor = beacon.altitude;
      const isHighAltitude = altitudeMetersForColor != null && altitudeMetersForColor > 610;
      const highAltFilter = isHighAltitude ? 'filter:grayscale(100%) brightness(0);' : '';
      
      const iconUrl = getBeaconSvgUrl(beaconType);
      
      const popupHtml = renderTrafficPopup({
        callsign: beacon.callsign,
        beaconType: beaconType,
        aircraftModel: beacon.aircraft_model,
        registration: beacon.registration,
        altitudeM: beacon.altitude,
        groundSpeedMs: beacon.ground_speed,
        verticalSpeedMs: beacon.vertical_speed,
        courseDeg: beacon.course,
        squawk: beacon.squawk,
        onGround: beacon.on_ground,
        updatedAt: beacon.last_update || beacon.updated_at,
        source: { kind: "safesky", subSource: beacon.source },
      });
      
      const existingMarker = safeskyMarkersCache.get(beaconId);
      
      if (existingMarker) {
        try {
          if (isMarkerAttached(existingMarker)) {
            if (!existingMarker.isPopupOpen()) {
              existingMarker.setLatLng([lat, lon]);
            }
            existingMarker.setPopupContent(popupHtml);
            
            if (!isDrone && !isHeli) {
              const el = existingMarker.getElement();
              if (el) {
                const img = el.querySelector('img');
                if (img) {
                  img.style.transform = `rotate(${course}deg)`;
                }
              }
            }
          }
        } catch (err) {
          // Marker DOM out of sync, remove and re-create next cycle
          console.warn('SafeSky: marker update error, removing stale marker', err);
          try { safeskyLayer.removeLayer(existingMarker); } catch {}
          safeskyMarkersCache.delete(beaconId);
          const intervalId = heliAnimIntervals.get(beaconId);
          if (intervalId != null) { clearInterval(intervalId); heliAnimIntervals.delete(beaconId); }
        }
      } else {
        try {
          const size = 56;
          const anchor = size / 2;
          const rotation = (!isDrone && !isHeli) ? `transform:rotate(${course}deg);` : '';
          
          const icon = L.divIcon({
            className: '',
            html: `<img src="${iconUrl}" style="width:${size}px;height:${size}px;${rotation}${highAltFilter}" data-beacon-type="${beaconType}" />`,
            iconSize: [size, size],
            iconAnchor: [anchor, anchor],
            popupAnchor: [0, -anchor],
          });
          
          const marker = L.marker([lat, lon], { icon, interactive: mode !== 'routePlanning', pane: 'safeskyPane' });
          marker.bindPopup(popupHtml, { autoPan: false, keepInView: false });
          marker.addTo(safeskyLayer);
          safeskyMarkersCache.set(beaconId, marker);
          
          if (isHeli) {
            let frameIdx = 0;
            const intervalId = window.setInterval(() => {
              if (destroyed) { clearInterval(intervalId); return; }
              if (!isMarkerAttached(marker)) { clearInterval(intervalId); heliAnimIntervals.delete(beaconId); return; }
              if (marker.isPopupOpen()) return;
              frameIdx = (frameIdx + 1) % HELI_ANIM_FRAMES.length;
              const el = marker.getElement();
              if (el) {
                const img = el.querySelector('img');
                if (img) {
                  img.src = HELI_ANIM_FRAMES[frameIdx];
                }
              }
            }, 200);
            heliAnimIntervals.set(beaconId, intervalId);
          }
        } catch (err) {
          console.warn('SafeSky: error adding marker', err);
        }
      }
    }
    
    for (const [id, marker] of safeskyMarkersCache) {
      if (!currentIds.has(id)) {
        try { safeskyLayer.removeLayer(marker); } catch {}
        safeskyMarkersCache.delete(id);
        const intervalId = heliAnimIntervals.get(id);
        if (intervalId != null) {
          clearInterval(intervalId);
          heliAnimIntervals.delete(id);
        }
      }
    }
  }

  function clearAllMarkers() {
    for (const [, marker] of safeskyMarkersCache) {
      try { safeskyLayer.removeLayer(marker); } catch {}
    }
    safeskyMarkersCache.clear();
    clearAllHeliIntervals();
  }

  async function fetchSafeSkyBeacons() {
    if (destroyed) return;

    // Zoom-terskel: for høyt zoomet ut betyr for mye trafikk å rendre. Rydd og hopp over.
    if (map && map.getZoom() < MIN_ZOOM_FOR_TRAFFIC) {
      if (safeskyMarkersCache.size > 0) clearAllMarkers();
      return;
    }

    try {
      // Bounds-filter: hent bare beacons innenfor synlig kartutsnitt (+ padding).
      // Sparer rader over ledningen når vi dekker Norge–Finland–Polen–Tyskland.
      let query = supabase.from('safesky_beacons').select('*').limit(2000);
      const bbox = currentBBox();
      if (bbox) {
        query = query
          .gte('latitude', bbox.minLat)
          .lte('latitude', bbox.maxLat)
          .gte('longitude', bbox.minLng)
          .lte('longitude', bbox.maxLng);
      }
      const { data, error } = await query;

      if (error) {
        console.error('SafeSky database error:', error);
        consecutiveFailures++;
        consecutiveEmptyResults = 0;
        if (consecutiveFailures >= MAX_FAILURES_BEFORE_RECONNECT) {
          console.warn('SafeSky: too many failures, reconnecting...');
          reconnect();
        }
        return;
      }

      consecutiveFailures = 0;
      const beacons = data || [];

      if (beacons.length === 0) {
        consecutiveEmptyResults++;
        if (consecutiveEmptyResults >= MAX_EMPTY_BEFORE_REFRESH) {
          console.warn('SafeSky: too many empty results, refreshing auth token...');
          consecutiveEmptyResults = 0;
          try {
            await supabase.auth.refreshSession();
          } catch (refreshErr) {
            console.error('SafeSky: token refresh failed', refreshErr);
          }
        }
      } else {
        consecutiveEmptyResults = 0;
      }

      renderSafeSkyBeacons(beacons);
    } catch (err) {
      console.error('Feil ved henting av SafeSky data:', err);
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_FAILURES_BEFORE_RECONNECT) {
        console.warn('SafeSky: too many failures, reconnecting...');
        reconnect();
      }
    }
  }

  // Polling-kadens for lufttrafikk. Cron-jobben skriver periodisk, så 15s gir
  // samme oppdateringsfølelse uten realtime-kostnaden.
  const SAFESKY_POLL_MS = 15000;
  let safeskyDebounceTimer: number | null = null;
  let safeskyPollInterval: number | null = null;
  let warmupTriggered = false;


  const debouncedFetchSafeSky = () => {
    if (destroyed) return;
    if (safeskyDebounceTimer) {
      clearTimeout(safeskyDebounceTimer);
    }
    safeskyDebounceTimer = window.setTimeout(() => {
      fetchSafeSkyBeacons();
    }, 500);
  };

  /** Trigger edge function to populate cache on-demand (deduplicated) */
  async function warmUpCache() {
    if (warmupTriggered || destroyed) return;
    warmupTriggered = true;
    try {
      console.log('SafeSky: triggering cache warm-up via edge function');
      const { error } = await supabase.functions.invoke('safesky-beacons-fetch', { body: {} });
      if (error) {
        console.warn('SafeSky: warm-up invoke failed', error);
      } else {
        console.log('SafeSky: warm-up complete');
      }
    } catch (err) {
      console.warn('SafeSky: warm-up error', err);
    }
  }

  /** Short retry burst on startup if cache is empty */
  async function startupRetryBurst() {
    const retryDelays = [2000, 4000, 6000];
    for (const delay of retryDelays) {
      if (destroyed || safeskyMarkersCache.size > 0) return;
      await new Promise(r => setTimeout(r, delay));
      if (destroyed) return;
      console.log(`SafeSky: startup retry after ${delay}ms`);
      await fetchSafeSkyBeacons();
    }
  }

  function reconnect() {
    if (destroyed) return;
    consecutiveFailures = 0;
    // Tear down current polling

    if (safeskyPollInterval) {
      clearInterval(safeskyPollInterval);
      safeskyPollInterval = null;
    }
    if (safeskyDebounceTimer) {
      clearTimeout(safeskyDebounceTimer);
      safeskyDebounceTimer = null;
    }
    // Restart after a short delay
    window.setTimeout(() => {
      if (!destroyed) {
        console.log('SafeSky: reconnecting...');
        start();
      }
    }, 2000);
  }

  const onMapMove = () => debouncedFetchSafeSky();

  async function start() {
    if (destroyed) return;
    // Nøyaktig ett aktivt polling-interval per manager/kartinstans.
    if (safeskyPollInterval === null) {
      console.log('Lufttrafikk: Starting polling');

      // Fire-and-forget warm-up (fills DB cache in background)
      warmUpCache();

      // Immediate DB fetch (may be empty first time, retry burst handles it)
      await fetchSafeSkyBeacons();

      // If still empty after first fetch, do short retry burst
      if (safeskyMarkersCache.size === 0 && !destroyed) {
        startupRetryBurst();
      }

      if (destroyed) return;
      if (safeskyPollInterval !== null) return;

      // Polling erstatter postgres_changes på safesky_beacons: callbacken brukte
      // aldri payloaden, og tabellen skrev ~28M WAL-oppdateringer via realtime.
      safeskyPollInterval = window.setInterval(() => {
        debouncedFetchSafeSky();
      }, SAFESKY_POLL_MS);

      // Refetch når kartutsnittet endres — kritisk for stor bbox (NO+SE+FI+DE+PL).
      if (map) {
        map.on('moveend', onMapMove);
        map.on('zoomend', onMapMove);
      }
    }
  }

  function stop() {
    if (safeskyPollInterval !== null) {
      console.log('Lufttrafikk: Stopping polling');
      clearInterval(safeskyPollInterval);
      safeskyPollInterval = null;
      safeskyLayer.clearLayers();
      safeskyMarkersCache.clear();
    }

    if (map) {
      try { map.off('moveend', onMapMove); } catch {}
      try { map.off('zoomend', onMapMove); } catch {}
    }
    if (safeskyPollInterval) {
      clearInterval(safeskyPollInterval);
      safeskyPollInterval = null;
    }
    if (safeskyDebounceTimer) {
      clearTimeout(safeskyDebounceTimer);
      safeskyDebounceTimer = null;
    }
    clearAllHeliIntervals();
  }

  function cleanup() {
    destroyed = true;
    stop();
  }

  return { start, stop, cleanup };
}
