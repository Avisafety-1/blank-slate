import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SAFESKY_ADVISORY_URL = 'https://sandbox-public-api.safesky.app/v1/advisory';
const SAFESKY_UAV_URL = 'https://sandbox-public-api.safesky.app/v1/uav';

// Norway bounding box for beacon fetching
const NORWAY_BOUNDS = {
  minLat: 57.5,
  maxLat: 71.5,
  minLon: 4.0,
  maxLon: 31.5
};

interface RoutePoint {
  lat: number;
  lng: number;
}

interface MissionRoute {
  coordinates: RoutePoint[];
  totalDistance?: number;
}

interface GeoJSONPolygonFeature {
  type: "Feature";
  properties: {
    id: string;
    call_sign: string;
    last_update: number;
    max_altitude: number;
    remarks: string;
  };
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

interface GeoJSONPointFeature {
  type: "Feature";
  properties: {
    id: string;
    call_sign: string;
    last_update: number;
    max_altitude: number;
    max_distance: number;
    remarks: string;
  };
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
}

interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: (GeoJSONPolygonFeature | GeoJSONPointFeature)[];
}

interface SafeSkyBeacon {
  id: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  course?: number;
  ground_speed?: number;
  vertical_speed?: number;
  beacon_type?: string;
  callsign?: string;
}

// Convert route coordinates to a closed polygon
function routeToPolygon(route: MissionRoute): number[][] {
  const coordinates = route.coordinates.map(p => [p.lng, p.lat]);
  if (coordinates.length > 0) {
    coordinates.push([...coordinates[0]]);
  }
  return coordinates;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('SafeSky cron refresh started');

  try {
    const SAFESKY_API_KEY = Deno.env.get('SAFESKY_API_KEY');
    if (!SAFESKY_API_KEY) {
      console.error('SAFESKY_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'SAFESKY_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // === PART 1: Refresh Advisory flights (polygon-based from route) ===
    const { data: polygonFlights, error: polygonFlightsError } = await supabase
      .from('active_flights')
      .select('id, mission_id, profile_id')
      .eq('publish_mode', 'advisory')
      .not('mission_id', 'is', null);

    if (polygonFlightsError) {
      console.error('Error fetching polygon advisory flights:', polygonFlightsError);
    }

    const advisoryResults: { flightId: string; success: boolean; error?: string }[] = [];

    if (polygonFlights && polygonFlights.length > 0) {
      console.log(`Found ${polygonFlights.length} active polygon advisory flights to refresh`);

      for (const flight of polygonFlights) {
        const missionId = flight.mission_id;
        if (!missionId) continue;

        try {
          const { data: mission, error: missionError } = await supabase
            .from('missions')
            .select('id, tittel, route')
            .eq('id', missionId)
            .single();

          if (missionError || !mission) {
            console.error(`Mission ${missionId} not found:`, missionError);
            advisoryResults.push({ flightId: flight.id, success: false, error: 'Mission not found' });
            continue;
          }

          const route = mission.route as MissionRoute | null;
          if (!route || !route.coordinates || route.coordinates.length < 3) {
            console.warn(`Mission ${missionId} has no valid route for advisory`);
            advisoryResults.push({ flightId: flight.id, success: false, error: 'No valid route' });
            continue;
          }

          const advisoryId = `AVS_${missionId.substring(0, 8)}`;
          const polygonCoordinates = routeToPolygon(route);

          const payload: GeoJSONFeatureCollection = {
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              properties: {
                id: advisoryId,
                call_sign: `Avisafe: ${mission.tittel.substring(0, 20)}`,
                last_update: Math.floor(Date.now() / 1000),
                max_altitude: 120,
                remarks: "Drone operation - planned route"
              },
              geometry: {
                type: "Polygon",
                coordinates: [polygonCoordinates]
              }
            }]
          };

          console.log(`Refreshing polygon advisory for mission ${missionId} (${mission.tittel})`);

          const response = await fetch(SAFESKY_ADVISORY_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': SAFESKY_API_KEY,
            },
            body: JSON.stringify(payload)
          });

          const responseText = await response.text();
          console.log(`SafeSky polygon advisory response for ${missionId}: ${response.status} - ${responseText}`);

          if (!response.ok) {
            advisoryResults.push({ flightId: flight.id, success: false, error: `API error: ${response.status}` });
          } else {
            advisoryResults.push({ flightId: flight.id, success: true });
          }

        } catch (err) {
          console.error(`Error refreshing polygon advisory for ${missionId}:`, err);
          advisoryResults.push({ flightId: flight.id, success: false, error: String(err) });
        }
      }
    }

    // === PART 1B: Refresh Point Advisory flights (live_uav mode with fixed start position) ===
    const { data: pointFlights, error: pointFlightsError } = await supabase
      .from('active_flights')
      .select('id, start_lat, start_lng, pilot_name')
      .eq('publish_mode', 'live_uav')
      .not('start_lat', 'is', null)
      .not('start_lng', 'is', null);

    if (pointFlightsError) {
      console.error('Error fetching point advisory flights:', pointFlightsError);
    }

    if (pointFlights && pointFlights.length > 0) {
      console.log(`Found ${pointFlights.length} active live_uav flights to refresh Point advisories`);

      for (const flight of pointFlights) {
        if (!flight.start_lat || !flight.start_lng) continue;

        try {
          const callSign = flight.pilot_name || 'Drone Pilot';
          const advisoryId = `AVS_LIVE_${flight.id.substring(0, 8)}`;

          const payload: GeoJSONFeatureCollection = {
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              properties: {
                id: advisoryId,
                call_sign: callSign,
                last_update: Math.floor(Date.now() / 1000),
                max_altitude: 120,
                max_distance: 100, // 100m radius
                remarks: "Live drone operation"
              },
              geometry: {
                type: "Point",
                coordinates: [flight.start_lng, flight.start_lat] // GeoJSON [lng, lat]
              }
            }]
          };

          console.log(`Refreshing Point advisory for flight ${flight.id} (${callSign})`);

          const response = await fetch(SAFESKY_ADVISORY_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': SAFESKY_API_KEY,
            },
            body: JSON.stringify(payload)
          });

          const responseText = await response.text();
          console.log(`SafeSky Point advisory response for ${flight.id}: ${response.status} - ${responseText}`);

          if (!response.ok) {
            advisoryResults.push({ flightId: flight.id, success: false, error: `API error: ${response.status}` });
          } else {
            advisoryResults.push({ flightId: flight.id, success: true });
          }

        } catch (err) {
          console.error(`Error refreshing Point advisory for ${flight.id}:`, err);
          advisoryResults.push({ flightId: flight.id, success: false, error: String(err) });
        }
      }
    }

    // === PART 2: Fetch and cache SafeSky beacons around active flights ===
    console.log('Fetching SafeSky beacons around active flights...');
    
    let beaconsUpserted = 0;
    let beaconsDeleted = 0;
    const allBeacons: SafeSkyBeacon[] = [];
    const seenBeaconIds = new Set<string>();

    // Fetch ALL active flights (both advisory and live_uav)
    const { data: allActiveFlights, error: allFlightsError } = await supabase
      .from('active_flights')
      .select('id, mission_id, publish_mode')
      .in('publish_mode', ['advisory', 'live_uav']);

    if (allFlightsError) {
      console.error('Error fetching all active flights for beacons:', allFlightsError);
    }

    if (allActiveFlights && allActiveFlights.length > 0) {
      console.log(`Found ${allActiveFlights.length} active flights to fetch beacons around`);

      for (const flight of allActiveFlights) {
        let queryLat: number | null = null;
        let queryLng: number | null = null;

        if (flight.mission_id) {
          // Get mission coordinates
          const { data: mission } = await supabase
            .from('missions')
            .select('latitude, longitude, route')
            .eq('id', flight.mission_id)
            .single();

          if (mission) {
            const route = mission.route as MissionRoute | null;
            if (route && route.coordinates && route.coordinates.length > 0) {
              // Use first route point
              queryLat = route.coordinates[0].lat;
              queryLng = route.coordinates[0].lng;
            } else if (mission.latitude && mission.longitude) {
              // Use mission location
              queryLat = mission.latitude;
              queryLng = mission.longitude;
            }
          }
        }

        if (queryLat === null || queryLng === null) {
          console.log(`Flight ${flight.id}: No valid coordinates, skipping beacon fetch`);
          continue;
        }

        const beaconsUrl = `${SAFESKY_UAV_URL}?lat=${queryLat.toFixed(4)}&lng=${queryLng.toFixed(4)}&rad=20000`;
        console.log(`Fetching beacons for flight ${flight.id}: ${beaconsUrl}`);

        try {
          const beaconsResponse = await fetch(beaconsUrl, {
            method: 'GET',
            headers: {
              'x-api-key': SAFESKY_API_KEY,
            }
          });

          if (beaconsResponse.ok) {
            const beaconsData = await beaconsResponse.json();
            console.log(`Flight ${flight.id}: Received ${beaconsData?.length || 0} beacons`);

            if (Array.isArray(beaconsData)) {
              for (const beacon of beaconsData) {
                const beaconId = beacon.id || `beacon_${beacon.latitude}_${beacon.longitude}`;
                if (!seenBeaconIds.has(beaconId)) {
                  seenBeaconIds.add(beaconId);
                  allBeacons.push({
                    id: beaconId,
                    latitude: beacon.latitude,
                    longitude: beacon.longitude,
                    altitude: beacon.altitude || null,
                    course: beacon.course || null,
                    ground_speed: beacon.ground_speed || null,
                    vertical_speed: beacon.vertical_speed || null,
                    beacon_type: beacon.beacon_type || beacon.type || null,
                    callsign: beacon.callsign || beacon.call_sign || null,
                  });
                }
              }
            }
          } else {
            const errorText = await beaconsResponse.text();
            console.error(`SafeSky beacons API error for flight ${flight.id}: ${beaconsResponse.status} - ${errorText}`);
          }
        } catch (err) {
          console.error(`Error fetching beacons for flight ${flight.id}:`, err);
        }
      }
    } else {
      console.log('No active flights - skipping beacon fetch');
    }

    // Upsert all collected beacons
    if (allBeacons.length > 0) {
      const beaconsWithTimestamp = allBeacons.map(b => ({
        ...b,
        updated_at: new Date().toISOString()
      }));

      const { error: upsertError } = await supabase
        .from('safesky_beacons')
        .upsert(beaconsWithTimestamp, { onConflict: 'id' });

      if (upsertError) {
        console.error('Error upserting beacons:', upsertError);
      } else {
        beaconsUpserted = allBeacons.length;
        console.log(`Upserted ${beaconsUpserted} unique beacons from all active flights`);
      }
    }

    // Delete old beacons (older than 60 seconds)
    const cutoffTime = new Date(Date.now() - 60000).toISOString();
    const { data: deletedData, error: deleteError } = await supabase
      .from('safesky_beacons')
      .delete()
      .lt('updated_at', cutoffTime)
      .select('id');

    if (deleteError) {
      console.error('Error deleting old beacons:', deleteError);
    } else {
      beaconsDeleted = deletedData?.length || 0;
      console.log(`Deleted ${beaconsDeleted} old beacons`);
    }

    const advisorySuccessCount = advisoryResults.filter(r => r.success).length;
    console.log(`Cron refresh complete: ${advisorySuccessCount}/${advisoryResults.length} advisories, ${beaconsUpserted} beacons cached`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        advisories: {
          refreshed: advisorySuccessCount,
          total: advisoryResults.length,
          results: advisoryResults
        },
        beacons: {
          upserted: beaconsUpserted,
          deleted: beaconsDeleted
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('SafeSky cron error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
