import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LayerConfig {
  url: string;
  table: string;
  nameField: string[];
  paginate?: boolean;
}

const LAYER_SOURCES: Record<string, LayerConfig> = {
  rpas_ctr_tiz: {
    url: 'https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_CTR_TIZ/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    table: 'rpas_ctr_tiz',
    nameField: ['navn', 'name', 'NAVN', 'NAME']
  },
  nsm_restriction_zones: {
    url: 'https://services9.arcgis.com/qCxEdsGu1A7NwfY1/ArcGIS/rest/services/Forbudsomr%c3%a5derNSM_v/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    table: 'nsm_restriction_zones',
    nameField: ['navn', 'name', 'NAVN', 'NAME', 'omradenavn', 'OMRADENAVN']
  },
  rpas_5km_zones: {
    url: 'https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_AVIGIS1/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    table: 'rpas_5km_zones',
    nameField: ['navn', 'name', 'NAVN', 'NAME', 'lufthavn', 'LUFTHAVN']
  },
};

const VERN_RESTRICTION_BASE_URL = 'https://kart.miljodirektoratet.no/arcgis/rest/services/vern_restriksjonsomrader/FeatureServer';
const VERN_RESTRICTION_SUB_LAYERS = [
  { layerIndex: 0, restrictionType: 'FERDSELSFORBUD' },
  { layerIndex: 1, restrictionType: 'LAVFLYVING' },
  { layerIndex: 2, restrictionType: 'LANDINGSFORBUD' },
];

// Convert Esri JSON geometry to GeoJSON geometry
function esriGeometryToGeoJson(esriGeom: any): any | null {
  if (!esriGeom) return null;

  if (esriGeom.rings) {
    if (esriGeom.rings.length === 1) {
      return { type: 'Polygon', coordinates: esriGeom.rings };
    }
    // Multiple rings: check if they are separate polygons or holes
    // Simple heuristic: treat as MultiPolygon if >1 outer ring
    return { type: 'Polygon', coordinates: esriGeom.rings };
  }

  if (esriGeom.paths) {
    if (esriGeom.paths.length === 1) {
      return { type: 'LineString', coordinates: esriGeom.paths[0] };
    }
    return { type: 'MultiLineString', coordinates: esriGeom.paths };
  }

  if (esriGeom.x !== undefined && esriGeom.y !== undefined) {
    return { type: 'Point', coordinates: [esriGeom.x, esriGeom.y] };
  }

  return null;
}

// Fetch paginated features from Esri JSON endpoint (f=json)
async function fetchEsriFeaturesPaginated(baseUrl: string): Promise<{ attributes: any; geometry: any }[]> {
  const allFeatures: any[] = [];
  let offset = 0;
  const pageSize = 2000;

  while (true) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${separator}resultOffset=${offset}&resultRecordCount=${pageSize}`;
    console.log(`  Fetching Esri page at offset ${offset}...`);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();

    // Esri JSON error check
    if (data.error) {
      throw new Error(`Esri error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    const features = data.features || [];
    allFeatures.push(...features);
    console.log(`  Got ${features.length} Esri features (total: ${allFeatures.length})`);

    if (features.length < pageSize) break;
    offset += pageSize;
  }

  return allFeatures;
}

// Fetch paginated GeoJSON features
async function fetchAllFeaturesPaginated(baseUrl: string): Promise<any[]> {
  const allFeatures: any[] = [];
  let offset = 0;
  const pageSize = 2000;
  
  while (true) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${separator}resultOffset=${offset}&resultRecordCount=${pageSize}`;
    console.log(`  Fetching page at offset ${offset}...`);
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const geojson = await response.json();
    const features = geojson.features || [];
    allFeatures.push(...features);
    console.log(`  Got ${features.length} features (total: ${allFeatures.length})`);
    
    if (features.length < pageSize) break;
    offset += pageSize;
  }
  
  return allFeatures;
}

function findName(properties: Record<string, any>, nameFields: string[]): string {
  for (const field of nameFields) {
    if (properties[field]) return properties[field];
  }
  return 'Ukjent';
}

function getExternalId(properties: Record<string, any>, fallback: string): string {
  return String(properties.OBJECTID || properties.FID || properties.objectid || properties.fid || fallback);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting geo layers synchronization...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: Record<string, any> = {};

    // 1. Sync standard layers (GeoJSON format - these ArcGIS instances support f=geojson)
    for (const [layerId, config] of Object.entries(LAYER_SOURCES)) {
      console.log(`Fetching ${layerId}...`);
      try {
        const response = await fetch(config.url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const geojson = await response.json();
        if (!geojson.features || !Array.isArray(geojson.features)) throw new Error('Invalid GeoJSON');
        const features = geojson.features;

        console.log(`Processing ${features.length} features for ${layerId}...`);
        let successCount = 0, errorCount = 0;

        for (const feature of features) {
          try {
            const props = feature.properties || {};
            const name = findName(props, config.nameField);
            const externalId = getExternalId(props, `${layerId}_${successCount}`);

            const { error } = await supabase.rpc('upsert_geojson_feature', {
              p_table_name: config.table,
              p_external_id: externalId,
              p_name: name,
              p_description: null,
              p_geometry_geojson: JSON.stringify(feature.geometry),
              p_properties: props
            });

            if (error) { console.error(`Error upserting ${externalId}:`, error); errorCount++; }
            else successCount++;
          } catch (e) { console.error('Error processing feature:', e); errorCount++; }
        }

        results[layerId] = { success: true, total: features.length, successCount, errorCount };
        console.log(`${layerId}: ${successCount} ok, ${errorCount} failed`);
      } catch (e) {
        console.error(`Error syncing ${layerId}:`, e);
        results[layerId] = { success: false, error: e instanceof Error ? e.message : 'Unknown' };
      }
    }

    // 2. Sync naturvern_zones (Esri JSON format, paginated)
    console.log('Fetching naturvern_zones (Esri JSON, paginated)...');
    try {
      const naturvernUrl = 'https://kart.miljodirektoratet.no/arcgis/rest/services/vern/FeatureServer/0/query?where=1%3D1&outFields=navn,verneform,offisieltNavn,OBJECTID&outSR=4326&f=json';
      const features = await fetchEsriFeaturesPaginated(naturvernUrl);
      console.log(`Processing ${features.length} naturvern features...`);
      let successCount = 0, errorCount = 0, skippedCount = 0;

      for (const feature of features) {
        try {
          const props = feature.attributes || {};
          const geojsonGeom = esriGeometryToGeoJson(feature.geometry);

          if (!geojsonGeom) {
            skippedCount++;
            continue;
          }

          const name = props.navn || props.offisieltNavn || 'Ukjent';
          const verneform = props.verneform || null;
          const externalId = getExternalId(props, `naturvern_${successCount}`);

          const { error } = await supabase.rpc('upsert_naturvern_zone', {
            p_external_id: externalId,
            p_name: name,
            p_verneform: verneform,
            p_geometry_geojson: JSON.stringify(geojsonGeom),
            p_properties: props
          });

          if (error) { console.error(`Error upserting naturvern ${externalId}:`, error); errorCount++; }
          else successCount++;
        } catch (e) { console.error('Error processing naturvern feature:', e); errorCount++; }
      }

      results['naturvern_zones'] = { success: true, total: features.length, successCount, errorCount, skippedCount };
      console.log(`naturvern_zones: ${successCount} ok, ${errorCount} failed, ${skippedCount} skipped (no geometry)`);
    } catch (e) {
      console.error('Error syncing naturvern_zones:', e);
      results['naturvern_zones'] = { success: false, error: e instanceof Error ? e.message : 'Unknown' };
    }

    // 3. Sync vern_restriction_zones (Esri JSON format, 3 sub-layers)
    console.log('Fetching vern_restriction_zones (Esri JSON, 3 sub-layers)...');
    try {
      let totalSuccess = 0, totalError = 0, totalFeatures = 0, totalSkipped = 0;

      for (const sub of VERN_RESTRICTION_SUB_LAYERS) {
        const url = `${VERN_RESTRICTION_BASE_URL}/${sub.layerIndex}/query?where=1%3D1&outFields=*&outSR=4326&f=json`;
        console.log(`  Fetching sub-layer ${sub.layerIndex} (${sub.restrictionType})...`);
        
        try {
          const response = await fetch(url);
          if (!response.ok) { console.error(`HTTP error for sub-layer ${sub.layerIndex}: ${response.status}`); continue; }
          
          const data = await response.json();
          
          if (data.error) {
            console.error(`Esri error for sub-layer ${sub.layerIndex}:`, data.error);
            continue;
          }

          const features = data.features || [];
          totalFeatures += features.length;
          console.log(`  Got ${features.length} features for ${sub.restrictionType}`);

          for (const feature of features) {
            try {
              const props = feature.attributes || {};
              const geojsonGeom = esriGeometryToGeoJson(feature.geometry);

              if (!geojsonGeom) {
                totalSkipped++;
                continue;
              }

              const name = findName(props, ['navn', 'name', 'NAVN', 'NAME']);
              const externalId = getExternalId(props, `vern_restr_${sub.layerIndex}_${totalSuccess}`);

              const { error } = await supabase.rpc('upsert_vern_restriction', {
                p_external_id: externalId,
                p_name: name,
                p_restriction_type: sub.restrictionType,
                p_geometry_geojson: JSON.stringify(geojsonGeom),
                p_properties: props
              });

              if (error) { console.error(`Error upserting vern restriction ${externalId}:`, error); totalError++; }
              else totalSuccess++;
            } catch (e) { console.error('Error processing vern restriction:', e); totalError++; }
          }
        } catch (e) {
          console.error(`Error fetching sub-layer ${sub.layerIndex}:`, e);
        }
      }

      results['vern_restriction_zones'] = { success: true, total: totalFeatures, successCount: totalSuccess, errorCount: totalError, skippedCount: totalSkipped };
      console.log(`vern_restriction_zones: ${totalSuccess} ok, ${totalError} failed, ${totalSkipped} skipped`);
    } catch (e) {
      console.error('Error syncing vern_restriction_zones:', e);
      results['vern_restriction_zones'] = { success: false, error: e instanceof Error ? e.message : 'Unknown' };
    }

    console.log('Synchronization complete!');

    return new Response(
      JSON.stringify({ success: true, message: 'Geo layers synchronization completed', results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Fatal error during synchronization:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
