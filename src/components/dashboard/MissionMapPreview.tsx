import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchTerrainElevations } from "@/lib/terrainElevation";
import { renderSoraZones } from "@/lib/soraGeometry";
import { getAipZones } from "@/lib/aipZoneCache";
import { sanitizeArcgisGeoJson } from "@/lib/mapDataFetchers";


interface RoutePoint {
  lat: number;
  lng: number;
}

interface SoraSettings {
  enabled: boolean;
  flightAltitude: number;
  contingencyDistance: number;
  contingencyHeight: number;
  groundRiskDistance: number;
}

interface RouteData {
  coordinates: RoutePoint[];
  totalDistance: number;
  soraSettings?: SoraSettings;
}

interface FlightTrackPosition {
  lat: number;
  lng: number;
  alt?: number;
  alt_msl?: number;
  alt_agl?: number;
  speed?: number;
  heading?: number;
  vert_speed?: number;
  timestamp?: string;
}

interface FlightTrack {
  positions: FlightTrackPosition[];
  flightLogId?: string;
  flightDate?: string;
}

interface NotamData {
  lat: number;
  lng: number;
  radiusNm: number;
  text: string;
}

interface MissionMapPreviewProps {
  latitude: number;
  longitude: number;
  route?: RouteData | null;
  flightTracks?: FlightTrack[] | null;
  notam?: NotamData | null;
}

export const MissionMapPreview = ({ latitude, longitude, route, flightTracks, notam }: MissionMapPreviewProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "en" ? "en-GB" : "nb-NO";
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const terrainElevationsRef = useRef<globalThis.Map<string, number>>(new globalThis.Map());
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Lazy-load: only initialize map when scrolled into view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || !mapRef.current || !latitude || !longitude) return;

    let isMounted = true;

    const map = L.map(mapRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    }).setView([latitude, longitude], 11);
    
    leafletMapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    // Mission marker
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3" fill="#3b82f6"/>
        </svg>
      </div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
    });

    L.marker([latitude, longitude], { icon }).addTo(map).bindPopup(t("dashboard.missionMapPreview.missionPosition"));

    const allPoints: [number, number][] = [[latitude, longitude]];

    const segments = segmentsFromRouteData(route ?? null).filter(s => s.coordinates.length > 0);
    const multiRoute = segments.length > 1;

    // SORA zones — én per rute
    const soraLayer = L.layerGroup().addTo(map);
    if (route?.soraSettings) {
      segments.forEach((segment) => {
        const validCoords = segment.coordinates.filter(
          p => p != null && typeof p.lat === 'number' && isFinite(p.lat) && typeof p.lng === 'number' && isFinite(p.lng)
        );
        if (validCoords.length >= 1) {
          renderSoraZones(validCoords, { flightGeographyDistance: 0, ...route.soraSettings! }, soraLayer);
        }
      });
    }

    // Planned routes
    if (segments.length > 0) {
      const routeLayer = L.layerGroup().addTo(map);
      segments.forEach((segment, routeIndex) => {
        const color = routeColor(routeIndex);
        const coords = segment.coordinates;
        if (coords.length > 1) {
          const latLngs = coords.map(p => [p.lat, p.lng] as [number, number]);
          L.polyline(latLngs, { color, weight: 3, opacity: 0.8, dashArray: '10, 5' }).addTo(routeLayer);
        }
        coords.forEach((point, index) => {
          allPoints.push([point.lat, point.lng]);
          const isFirst = index === 0;
          const isLast = index === coords.length - 1 && coords.length > 1;
          let bgColor = color;
          if (isFirst) bgColor = '#22c55e';
          else if (isLast) bgColor = '#ef4444';
          const marker = L.marker([point.lat, point.lng], {
            icon: L.divIcon({
              className: '',
              html: `<div style="width:24px;height:24px;background:${bgColor};border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:11px;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${index + 1}</div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            }),
          }).addTo(routeLayer);
          if (multiRoute) {
            marker.bindTooltip(
              `${t('pages.missions.card.routeN', { n: routeIndex + 1 })} · ${index + 1}`,
              { direction: 'top' }
            );
          }
        });
      });
    }


    // Flight tracks
    if (flightTracks && flightTracks.length > 0) {
      if (!map.getPane('flightTrackPane')) {
        map.createPane('flightTrackPane');
        map.getPane('flightTrackPane')!.style.zIndex = '700';
        map.getPane('popupPane')!.style.zIndex = '800';
      }
      const tracksLayer = L.layerGroup().addTo(map);
      const allTrackPositions = flightTracks.flatMap(t => t.positions || []);
      fetchTerrainElevations(allTrackPositions).then((elevations) => {
        if (!isMounted) return;
        allTrackPositions.forEach((pos, i) => {
          if (elevations[i] != null) {
            terrainElevationsRef.current.set(`${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`, elevations[i]!);
          }
        });
      }).catch(() => {});

      flightTracks.forEach((track, trackIndex) => {
        if (!track.positions || track.positions.length < 2) return;
        const latLngs = track.positions.map(p => [p.lat, p.lng] as [number, number]);
        const trackLine = L.polyline(latLngs, { color: '#22c55e', weight: 5, opacity: 0.9, pane: 'flightTrackPane' }).addTo(tracksLayer);
        latLngs.forEach(ll => allPoints.push(ll));

        trackLine.on('click', (e: L.LeafletMouseEvent) => {
          const clickLatLng = e.latlng;
          let nearestIdx = 0;
          let minDist = Infinity;
          track.positions.forEach((pos, idx) => {
            const dist = clickLatLng.distanceTo(L.latLng(pos.lat, pos.lng));
            if (dist < minDist) { minDist = dist; nearestIdx = idx; }
          });
          const pos = track.positions[nearestIdx];
          const altitude = pos.alt_msl ?? pos.alt ?? null;
          const terrainKey = `${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`;
          const terrainElev = terrainElevationsRef.current.get(terrainKey);
          const aglValue = altitude != null && terrainElev != null ? altitude - terrainElev : null;
          const content = `<div style="font-size:12px;line-height:1.5">
            <strong>${t("dashboard.missionMapPreview.pointOf", { n: nearestIdx + 1, total: track.positions.length })}</strong><hr style="margin:4px 0"/>
            ${altitude != null ? t("dashboard.missionMapPreview.heightMsl", { m: Math.round(altitude) }) + '<br/>' : ''}
            ${aglValue != null ? '<strong>' + t("dashboard.missionMapPreview.heightAgl", { m: Math.round(aglValue) }) + '</strong><br/>' : ''}
            ${terrainElev != null ? t("dashboard.missionMapPreview.terrain", { m: Math.round(terrainElev) }) + '<br/>' : ''}
            ${pos.speed != null ? t("dashboard.missionMapPreview.speed", { v: pos.speed.toFixed(1) }) + '<br/>' : ''}
            ${pos.heading != null ? t("dashboard.missionMapPreview.heading", { deg: Math.round(pos.heading) }) + '<br/>' : ''}
            ${pos.vert_speed != null ? t("dashboard.missionMapPreview.vertSpeed", { v: pos.vert_speed.toFixed(1) }) + '<br/>' : ''}
            ${pos.timestamp ? t("dashboard.missionMapPreview.time", { t: new Date(pos.timestamp).toLocaleTimeString(locale) }) : ''}
          </div>`;
          L.popup().setLatLng([pos.lat, pos.lng]).setContent(content).openOn(map);
        });

        const startPos = track.positions[0];
        L.circleMarker([startPos.lat, startPos.lng], {
          radius: 8, fillColor: '#22c55e', color: '#fff', weight: 2, fillOpacity: 1, pane: 'flightTrackPane',
        }).addTo(tracksLayer).bindPopup(t("dashboard.missionMapPreview.flightStart", { n: trackIndex + 1 }));

        const endPos = track.positions[track.positions.length - 1];
        L.circleMarker([endPos.lat, endPos.lng], {
          radius: 8, fillColor: '#f97316', color: '#fff', weight: 2, fillOpacity: 1, pane: 'flightTrackPane',
        }).addTo(tracksLayer).bindPopup(t("dashboard.missionMapPreview.flightEnd", { n: trackIndex + 1 }));
      });
    }

    // NOTAM circle
    if (notam && notam.lat && notam.lng && notam.radiusNm > 0) {
      const radiusMeters = notam.radiusNm * 1852;
      const notamCircle = L.circle([notam.lat, notam.lng], {
        radius: radiusMeters,
        color: '#f59e0b',
        weight: 2,
        fillColor: '#f59e0b',
        fillOpacity: 0.1,
        dashArray: '6, 4',
      }).addTo(map);
      notamCircle.bindPopup(`<div style="font-size:12px;max-width:300px;white-space:pre-wrap;font-family:monospace;"><strong>NOTAM</strong><hr style="margin:4px 0"/>${notam.text}</div>`);
      const cb = notamCircle.getBounds();
      allPoints.push([cb.getSouthWest().lat, cb.getSouthWest().lng]);
      allPoints.push([cb.getNorthEast().lat, cb.getNorthEast().lng]);
    }

    if (allPoints.length > 1) {
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 18 });
    }

    // Airspace zones — external APIs + shared AIP cache
    const zonesLayer = L.layerGroup().addTo(map);

    async function fetchZones() {
      if (!isMounted) return;
      try {
        const [nsmResponse, rpasResponse, ctrResponse] = await Promise.all([
          fetch("https://services9.arcgis.com/qCxEdsGu1A7NwfY1/ArcGIS/rest/services/Forbudsomr%c3%a5derNSM_v/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"),
          fetch("https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_AVIGIS1/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"),
          fetch("https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_CTR_TIZ/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"),
        ]);

        if (nsmResponse.ok && isMounted) {
          const nsmData = sanitizeArcgisGeoJson(await nsmResponse.json());
          if (nsmData) {
            try {
              L.geoJSON(nsmData, {
                style: { color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.15 },
                onEachFeature: (feature, layer) => {
                  const name = feature.properties?.navn || feature.properties?.name || t("dashboard.missionMapPreview.nsmZoneDefault");
                  layer.bindPopup(`<strong>NSM</strong><br/>${name}`);
                }
              }).addTo(zonesLayer);
            } catch (e) { console.warn('NSM-lag hoppet over:', e); }
          }
        }

        if (rpasResponse.ok && isMounted) {
          const rpasData = sanitizeArcgisGeoJson(await rpasResponse.json());
          if (rpasData) {
            try {
              L.geoJSON(rpasData, {
                style: { color: '#f97316', weight: 2, fillColor: '#f97316', fillOpacity: 0.15 },
                onEachFeature: (feature, layer) => {
                  const name = feature.properties?.navn || feature.properties?.name || t("dashboard.missionMapPreview.rpasZoneDefault");
                  layer.bindPopup(`<strong>RPAS 5km</strong><br/>${name}`);
                }
              }).addTo(zonesLayer);
            } catch (e) { console.warn('RPAS-lag hoppet over:', e); }
          }
        }

        if (ctrResponse.ok && isMounted) {
          const ctrData = sanitizeArcgisGeoJson(await ctrResponse.json());
          if (ctrData) {
            try {
              L.geoJSON(ctrData, {
                style: { color: '#ec4899', weight: 2, fillColor: '#ec4899', fillOpacity: 0.15 },
                onEachFeature: (feature, layer) => {
                  const name = feature.properties?.navn || feature.properties?.name || t("dashboard.missionMapPreview.ctrTizDefault");
                  layer.bindPopup(`<strong>RPAS CTR/TIZ</strong><br/>${name}`);
                }
              }).addTo(zonesLayer);
            } catch (e) { console.warn('CTR/TIZ-lag hoppet over:', e); }
          }
        }


        // AIP zones from shared cache (eliminates N+1)
        try {
          const aipZones = await getAipZones();
          if (!isMounted) return;
          for (const zone of aipZones) {
            if (!zone.geometry || !isMounted) continue;
            let color = '#f59e0b';
            let label = t("dashboard.missionMapPreview.aipDanger");
            let dashArray: string | undefined = undefined;
            if (zone.zone_type === 'P') { color = '#dc2626'; label = t("dashboard.missionMapPreview.aipProhibited"); }
            else if (zone.zone_type === 'R') { color = '#8b5cf6'; label = t("dashboard.missionMapPreview.aipRestricted"); }
            else if (zone.zone_type === 'D') { dashArray = '5, 5'; }
            else if (zone.zone_type === 'RMZ') { color = '#22c55e'; label = 'RMZ'; dashArray = '8, 6'; }
            else if (zone.zone_type === 'TMZ') { color = '#06b6d4'; label = 'TMZ'; dashArray = '8, 6'; }
            else if (zone.zone_type === 'ATZ') { color = '#38bdf8'; label = t("dashboard.missionMapPreview.aipAtz"); }
            else if (zone.zone_type === 'CTR') { color = '#ec4899'; label = 'CTR'; }
            else if (zone.zone_type === 'TIZ') { color = '#a78bfa'; label = 'TIZ'; dashArray = '8, 6'; }

            try {
              // ATZ småflyplasser tegnes som 5 km sirkel rundt sentroide.
              if (zone.zone_type === 'ATZ') {
                const tmp = L.geoJSON({ type: 'Feature', geometry: zone.geometry, properties: {} } as any);
                const center = tmp.getBounds().getCenter();
                const displayName = zone.name || zone.zone_id || t("dashboard.missionMapPreview.airfieldUnknown");
                L.circle(center, {
                  radius: 5000,
                  color, weight: 2, fillColor: color, fillOpacity: 0.15,
                }).bindPopup(`<strong>${label}</strong><br/><strong>${displayName}</strong><br/>${t("dashboard.missionMapPreview.contactAirfield")} <a href="https://myppr.no" target="_blank" rel="noopener noreferrer">myppr.no</a>`).addTo(zonesLayer);
                continue;
              }
              L.geoJSON({ type: 'Feature', geometry: zone.geometry, properties: {} } as any, {
                style: { color, weight: 2, fillColor: color, fillOpacity: 0.15, dashArray },
                onEachFeature: (_feature, layer) => {
                  const displayName = zone.name || zone.zone_id || t("dashboard.missionMapPreview.unknown");
                  layer.bindPopup(`<strong>${label}</strong><br/><strong>${displayName}</strong><br/>${zone.upper_limit ? t("dashboard.missionMapPreview.upperLimit", { v: zone.upper_limit }) : ''}`);
                }
              }).addTo(zonesLayer);
            } catch {}
          }
        } catch (err) {
          console.error("Feil ved henting av AIP-soner:", err);
        }
      } catch (err) {
        console.error("Feil ved henting av luftromssoner:", err);
      }
    }

    fetchZones();

    return () => {
      isMounted = false;
      try {
        map.stop();
        map.remove();
      } catch {
        // Suppress Leaflet _leaflet_pos errors during rapid unmount
      }
    };
  }, [isVisible, latitude, longitude, route, flightTracks, notam, t, locale]);

  return (
    <div ref={containerRef} className="relative w-full h-full rounded-lg overflow-hidden border border-border">
      {isVisible ? (
        <div ref={mapRef} className="absolute inset-0" />
      ) : (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
    </div>
  );
};
