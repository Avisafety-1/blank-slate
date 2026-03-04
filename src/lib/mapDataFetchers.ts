import L from "leaflet";
import { supabase } from "@/integrations/supabase/client";
import { droneAnimatedIcon } from "@/lib/mapIcons";
import airportIcon from "@/assets/airport-icon.png";

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
    const url = "https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_AVIGIS1/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";
    const response = await fetch(url);
    if (!response.ok) return;
    
    const geojson = await response.json();
    const geoJsonLayer = L.geoJSON(geojson, {
      interactive: mode !== 'routePlanning',
      pane: 'rpasPane',
      style: {
        color: '#f97316',
        weight: 2,
        fillColor: '#f97316',
        fillOpacity: 0.2,
      },
      onEachFeature: mode !== 'routePlanning' ? (feature, layer) => {
        if (feature.properties) {
          const name = feature.properties.navn || feature.properties.name || 'Ukjent';
          layer.bindPopup(`<strong>RPAS 5km sone</strong><br/>${name}`);
        }
      } : undefined
    });

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

export async function fetchAipRestrictionZones(params: GeoJsonFetchParams) {
  const { layer, mode, aipGeoJsonLayersRef, setGeoJsonInteractivity, modeRef } = params;
  try {
    const { data, error } = await supabase
      .from('aip_restriction_zones')
      .select('zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry, properties')
      .in('zone_type', ['P', 'R', 'D']);

    if (error || !data) {
      console.error('Feil ved henting av AIP-soner:', error);
      return;
    }

    layer.clearLayers();
    if (aipGeoJsonLayersRef) {
      aipGeoJsonLayersRef.current = [];
    }

    for (const zone of data) {
      if (!zone.geometry) continue;

      let color = '#f59e0b';
      let label = 'Fareområde';
      if (zone.zone_type === 'P') {
        color = '#dc2626';
        label = 'Forbudsområde';
      } else if (zone.zone_type === 'R') {
        color = '#8b5cf6';
        label = 'Restriksjonsområde';
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

        const geoJsonLayer = L.geoJSON(geojsonFeature as any, {
          interactive: mode !== 'routePlanning',
          style: {
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.2,
            dashArray: zone.zone_type === 'D' ? '5, 5' : undefined,
            pane: 'aipPane',
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
          } : undefined,
        });
        geoJsonLayer.addTo(layer);
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
    console.error('Kunne ikke hente AIP restriksjonsområder:', err);
  }
}

export async function fetchRmzTmzAtzZones(params: GeoJsonFetchParams) {
  const { layer, mode, aipGeoJsonLayersRef, setGeoJsonInteractivity, modeRef } = params;
  try {
    const { data, error } = await supabase
      .from('aip_restriction_zones')
      .select('zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry, properties')
      .in('zone_type', ['RMZ', 'TMZ', 'ATZ', 'CTR', 'TIZ']);

    if (error || !data) {
      console.error('Feil ved henting av RMZ/TMZ/ATZ-soner:', error);
      return;
    }

    layer.clearLayers();

    for (const zone of data) {
      if (!zone.geometry) continue;

      let color = '#22c55e';
      let label = 'RMZ (Radio Mandatory Zone)';
      let dashArray: string | undefined = '8, 6';
      if (zone.zone_type === 'TMZ') {
        color = '#06b6d4';
        label = 'TMZ (Transponder Mandatory Zone)';
        dashArray = '8, 6';
      } else if (zone.zone_type === 'ATZ') {
        color = '#38bdf8';
        label = 'ATZ (Aerodrome Traffic Zone)';
        dashArray = undefined;
      } else if (zone.zone_type === 'CTR') {
        color = '#ec4899';
        label = 'CTR (Control Zone)';
        dashArray = undefined;
      } else if (zone.zone_type === 'TIZ') {
        color = '#a78bfa';
        label = 'TIZ (Traffic Information Zone)';
        dashArray = '8, 6';
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

        const geoJsonLayer = L.geoJSON(geojsonFeature as any, {
          interactive: mode !== 'routePlanning',
          style: {
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.12,
            dashArray,
            pane: 'rmzPane',
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
          } : undefined,
        });
        geoJsonLayer.addTo(layer);
        if (aipGeoJsonLayersRef) {
          aipGeoJsonLayersRef.current.push(geoJsonLayer);
        }
        if (modeRef.current === 'routePlanning') {
          setGeoJsonInteractivity(geoJsonLayer, false);
        }
      } catch (err) {
        console.error(`Feil ved parsing av ${zone.zone_type}-sone ${zone.zone_id}:`, err);
      }
    }
  } catch (err) {
    console.error('Kunne ikke hente RMZ/TMZ/ATZ-soner:', err);
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
    
    latestByDrone.forEach((t, droneId) => {
      if (!t.lat || !t.lon) return;
      
      const icon = L.divIcon({
        className: '',
        html: `<img src="${droneAnimatedIcon}" style="width:70px;height:70px;" />`,
        iconSize: [70, 70],
        iconAnchor: [35, 35],
        popupAnchor: [0, -35],
      });
      
      const marker = L.marker([t.lat, t.lon], { icon, interactive: modeRef.current !== 'routePlanning' });
      const updatedTime = t.created_at ? new Date(t.created_at).toLocaleTimeString('no-NO') : 'Ukjent';
      marker.bindPopup(
        `<div>
          <strong>🛸 ${droneId}</strong><br/>
          Høyde: ${t.alt ?? '?'} m<br/>
          Oppdatert: ${updatedTime}
        </div>`,
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
      .select('id, mission_id, publish_mode, route_data')
      .eq('publish_mode', 'advisory');
    
    if (error) {
      console.error('Error fetching active advisories:', error);
      return;
    }
    
    activeAdvisoryLayer.clearLayers();
    for (const [key] of flightMarkersRef.current) {
      if (key.startsWith('advisory_')) flightMarkersRef.current.delete(key);
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
      
      polygon.bindPopup(`
        <div>
          <strong>🛸 Aktiv flytur</strong><br/>
          <span style="color: #10b981; font-size: 11px;">Advisory publisert til SafeSky</span>
        </div>
      `);
      
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
      const centroidMarker = L.marker([centLat, centLng], { icon: droneIcon, interactive: true });
      centroidMarker.bindPopup(`
        <div>
          <strong>🛸 Aktiv flytur</strong><br/>
          <span style="color: #10b981; font-size: 11px;">Advisory publisert til SafeSky</span>
        </div>
      `);
      centroidMarker.addTo(activeAdvisoryLayer);
      flightMarkersRef.current.set(flight.id, centroidMarker as any);
    }
  } catch (err) {
    console.error('Error fetching active advisories:', err);
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
      .select('id, start_lat, start_lng, pilot_name, start_time')
      .eq('publish_mode', 'live_uav')
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
      
      const pilotIcon = L.divIcon({
        className: '',
        html: `<div style="
          width: 32px;
          height: 32px;
          background: #0ea5e9;
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
        interactive: mode !== 'routePlanning' 
      });
      
      const startTime = flight.start_time ? new Date(flight.start_time).toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' }) : 'Ukjent';
      const pilotName = flight.pilot_name || 'Ukjent pilot';
      
      marker.bindPopup(`
        <div>
          <strong>👤 ${pilotName}</strong><br/>
          <span style="font-size: 11px; color: #666;">Pilot (live posisjon)</span><br/>
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
