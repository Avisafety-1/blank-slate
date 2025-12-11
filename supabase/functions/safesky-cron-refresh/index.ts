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

interface GeoJSONFeature {
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

interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
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

    // === PART 1: Refresh Advisory flights ===
    const { data: activeFlights, error: flightsError } = await supabase
      .from('active_flights')
      .select('id, mission_id, profile_id')
      .eq('publish_mode', 'advisory')
      .not('mission_id', 'is', null);

    if (flightsError) {
      console.error('Error fetching active flights:', flightsError);
    }

    const advisoryResults: { missionId: string; success: boolean; error?: string }[] = [];

    if (activeFlights && activeFlights.length > 0) {
      console.log(`Found ${activeFlights.length} active advisory flights to refresh`);

      for (const flight of activeFlights) {
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
            advisoryResults.push({ missionId, success: false, error: 'Mission not found' });
            continue;
          }

          const route = mission.route as MissionRoute | null;
          if (!route || !route.coordinates || route.coordinates.length < 3) {
            console.warn(`Mission ${missionId} has no valid route for advisory`);
            advisoryResults.push({ missionId, success: false, error: 'No valid route' });
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

          console.log(`Refreshing advisory for mission ${missionId} (${mission.tittel})`);

          const response = await fetch(SAFESKY_ADVISORY_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': SAFESKY_API_KEY,
            },
            body: JSON.stringify(payload)
          });

          const responseText = await response.text();
          console.log(`SafeSky advisory response for ${missionId}: ${response.status} - ${responseText}`);

          if (!response.ok) {
            advisoryResults.push({ missionId, success: false, error: `API error: ${response.status}` });
          } else {
            advisoryResults.push({ missionId, success: true });
          }

        } catch (err) {
          console.error(`Error refreshing advisory for ${missionId}:`, err);
          advisoryResults.push({ missionId, success: false, error: String(err) });
        }
      }
    }

    // === PART 2: Fetch and cache SafeSky beacons ===
    console.log('Fetching SafeSky beacons for Norway...');
    
    // Calculate center of Norway for the API call
    const centerLat = (NORWAY_BOUNDS.minLat + NORWAY_BOUNDS.maxLat) / 2;
    const centerLon = (NORWAY_BOUNDS.minLon + NORWAY_BOUNDS.maxLon) / 2;
    // Large radius to cover Norway (approximately 1000km)
    const radius = 1000;

    const beaconsUrl = `${SAFESKY_UAV_URL}?lat=${centerLat.toFixed(4)}&lon=${centerLon.toFixed(4)}&radius=${radius}`;
    
    let beaconsUpserted = 0;
    let beaconsDeleted = 0;

    try {
      const beaconsResponse = await fetch(beaconsUrl, {
        method: 'GET',
        headers: {
          'x-api-key': SAFESKY_API_KEY,
        }
      });

      if (beaconsResponse.ok) {
        const beaconsData = await beaconsResponse.json();
        console.log(`Received ${beaconsData?.length || 0} beacons from SafeSky`);

        if (Array.isArray(beaconsData) && beaconsData.length > 0) {
          // Transform beacons for database
          const beaconsToUpsert: SafeSkyBeacon[] = beaconsData.map((beacon: any) => ({
            id: beacon.id || `beacon_${beacon.latitude}_${beacon.longitude}_${Date.now()}`,
            latitude: beacon.latitude,
            longitude: beacon.longitude,
            altitude: beacon.altitude || null,
            course: beacon.course || null,
            ground_speed: beacon.ground_speed || null,
            vertical_speed: beacon.vertical_speed || null,
            beacon_type: beacon.beacon_type || beacon.type || null,
            callsign: beacon.callsign || beacon.call_sign || null,
            updated_at: new Date().toISOString()
          }));

          // Upsert beacons
          const { error: upsertError } = await supabase
            .from('safesky_beacons')
            .upsert(beaconsToUpsert, { onConflict: 'id' });

          if (upsertError) {
            console.error('Error upserting beacons:', upsertError);
          } else {
            beaconsUpserted = beaconsToUpsert.length;
            console.log(`Upserted ${beaconsUpserted} beacons`);
          }
        }

        // Delete old beacons (older than 60 seconds)
        const cutoffTime = new Date(Date.now() - 60000).toISOString();
        const { error: deleteError } = await supabase
          .from('safesky_beacons')
          .delete()
          .lt('updated_at', cutoffTime);

        if (deleteError) {
          console.error('Error deleting old beacons:', deleteError);
        } else {
          console.log('Deleted old beacons');
          console.log(`Deleted ${beaconsDeleted} old beacons`);
        }
      } else {
        const errorText = await beaconsResponse.text();
        console.error(`SafeSky beacons API error: ${beaconsResponse.status} - ${errorText}`);
      }
    } catch (beaconErr) {
      console.error('Error fetching beacons:', beaconErr);
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
