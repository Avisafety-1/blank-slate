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
  /** For layers that combine multiple FeatureServer sub-layers */
  subLayers?: { layerIndex: number; restrictionType: string }[];
  /** Extra field to extract from properties */
  extraField?: string;
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
  naturvern_zones: {
    url: 'https://kart.miljodirektoratet.no/arcgis/rest/services/vern/FeatureServer/0/query?where=1%3D1&outFields=navn,verneform,offisieltNavn&outSR=4326&f=geojson',
    table: 'naturvern_zones',
    nameField: ['navn', 'offisieltNavn', 'name'],
    paginate: true,
    extraField: 'verneform',
  },
};

// Vern-restriksjoner: 3 separate sub-layers from the same service
const VERN_RESTRICTION_BASE_URL = 'https://kart.miljodirektoratet.no/arcgis/rest/services/vern_restriksjonsomrader/FeatureServer';
const VERN_RESTRICTION_SUB_LAYERS = [
  { layerIndex: 0, restrictionType: 'FERDSELSFORBUD' },
  { layerIndex: 1, restrictionType: 'LAVFLYVING' },
  { layerIndex: 2, restrictionType: 'LANDINGSFORBUD' },
];

async function fetchAllFeaturesPaginated(baseUrl: string): Promise<any[]> {
  const allFeatures: any[] = [];
  let offset = 0;
  const pageSize = 2000;
  
  while (true) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${separator}resultOffset=${offset}&resultRecordCount=${pageSize}`;
    console.log(`  Fetching page at offset ${offset}...`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const geojson = await response.json();
    const features = geojson.features || [];
    allFeatures.push(...features);
    
    console.log(`  Got ${features.length} features (total: ${allFeatures.length})`);
    
    // If we got fewer than pageSize, we've reached the end
    if (features.length < pageSize) break;
    offset += pageSize;
  }
  
  return allFeatures;
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

    // Sync standard layers
    for (const [layerId, config] of Object.entries(LAYER_SOURCES)) {
      console.log(`Fetching ${layerId}...`);
      
      try {
        let features: any[];
        
        if (config.paginate) {
          features = await fetchAllFeaturesPaginated(config.url);
        } else {
          const response = await fetch(config.url);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const geojson = await response.json();
          if (!geojson.features || !Array.isArray(geojson.features)) {
            throw new Error('Invalid GeoJSON format: missing features array');
          }
          features = geojson.features;
        }

        console.log(`Processing ${features.length} features for ${layerId}...`);

        let successCount = 0;
        let errorCount = 0;

        for (const feature of features) {
          try {
            const properties = feature.properties || {};
            
            let name = 'Ukjent';
            for (const field of config.nameField) {
              if (properties[field]) {
                name = properties[field];
                break;
              }
            }

            const externalId = properties.OBJECTID || properties.FID || properties.objectid || properties.fid || `${layerId}_${successCount}`;

            // For naturvern_zones, include verneform
            const description = config.extraField && properties[config.extraField]
              ? properties[config.extraField]
              : null;
            
            const { error } = await supabase.rpc('upsert_geojson_feature', {
              p_table_name: config.table,
              p_external_id: String(externalId),
              p_name: name,
              p_description: description,
              p_geometry_geojson: JSON.stringify(feature.geometry),
              p_properties: properties
            });

            if (error) {
              console.error(`Error upserting feature ${externalId}:`, error);
              errorCount++;
            } else {
              successCount++;
            }
          } catch (featureError) {
            console.error(`Error processing feature:`, featureError);
            errorCount++;
          }
        }

        results[layerId] = {
          success: true,
          total: features.length,
          successCount,
          errorCount
        };

        console.log(`${layerId}: ${successCount} succeeded, ${errorCount} failed`);

      } catch (layerError) {
        console.error(`Error syncing ${layerId}:`, layerError);
        results[layerId] = {
          success: false,
          error: layerError instanceof Error ? layerError.message : 'Unknown error'
        };
      }
    }

    // Sync vern restriction zones (3 sub-layers)
    console.log('Fetching vern_restriction_zones (3 sub-layers)...');
    try {
      let totalSuccess = 0;
      let totalError = 0;
      let totalFeatures = 0;

      for (const sub of VERN_RESTRICTION_SUB_LAYERS) {
        const url = `${VERN_RESTRICTION_BASE_URL}/${sub.layerIndex}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson`;
        console.log(`  Fetching sub-layer ${sub.layerIndex} (${sub.restrictionType})...`);
        
        const response = await fetch(url);
        if (!response.ok) {
          console.error(`  HTTP error for sub-layer ${sub.layerIndex}: ${response.status}`);
          continue;
        }
        
        const geojson = await response.json();
        const features = geojson.features || [];
        totalFeatures += features.length;
        console.log(`  Got ${features.length} features for ${sub.restrictionType}`);

        for (const feature of features) {
          try {
            const properties = feature.properties || {};
            const name = properties.navn || properties.name || properties.NAVN || properties.NAME || 'Ukjent';
            const externalId = properties.OBJECTID || properties.FID || properties.objectid || properties.fid || `vern_restr_${sub.layerIndex}_${totalSuccess}`;

            // Direct insert/upsert for vern_restriction_zones
            const { error } = await supabase
              .from('vern_restriction_zones')
              .upsert({
                external_id: String(externalId),
                name,
                restriction_type: sub.restrictionType,
                properties,
              }, { onConflict: 'external_id' })
              .select();

            // If upsert doesn't work due to missing unique constraint, use RPC
            if (error) {
              // Fallback: use the generic RPC but manually set restriction_type after
              const { error: rpcError } = await supabase.rpc('upsert_geojson_feature', {
                p_table_name: 'vern_restriction_zones',
                p_external_id: String(externalId),
                p_name: name,
                p_description: sub.restrictionType,
                p_geometry_geojson: JSON.stringify(feature.geometry),
                p_properties: properties
              });

              if (rpcError) {
                console.error(`Error upserting vern restriction ${externalId}:`, rpcError);
                totalError++;
              } else {
                totalSuccess++;
              }
            } else {
              totalSuccess++;
            }
          } catch (featureError) {
            console.error(`Error processing vern restriction feature:`, featureError);
            totalError++;
          }
        }
      }

      results['vern_restriction_zones'] = {
        success: true,
        total: totalFeatures,
        successCount: totalSuccess,
        errorCount: totalError
      };

      console.log(`vern_restriction_zones: ${totalSuccess} succeeded, ${totalError} failed`);

    } catch (vernError) {
      console.error('Error syncing vern_restriction_zones:', vernError);
      results['vern_restriction_zones'] = {
        success: false,
        error: vernError instanceof Error ? vernError.message : 'Unknown error'
      };
    }

    console.log('Synchronization complete!');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Geo layers synchronization completed',
        results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Fatal error during synchronization:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
