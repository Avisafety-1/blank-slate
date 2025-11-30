import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LayerConfig {
  url: string;
  table: string;
  nameField: string[];
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
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting geo layers synchronization...');

    // Use service role key to bypass RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: Record<string, any> = {};

    // Sync each layer
    for (const [layerId, config] of Object.entries(LAYER_SOURCES)) {
      console.log(`Fetching ${layerId} from ${config.url}...`);
      
      try {
        const response = await fetch(config.url);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const geojson = await response.json();
        
        if (!geojson.features || !Array.isArray(geojson.features)) {
          throw new Error('Invalid GeoJSON format: missing features array');
        }

        console.log(`Processing ${geojson.features.length} features for ${layerId}...`);

        let successCount = 0;
        let errorCount = 0;

        // Process each feature
        for (const feature of geojson.features) {
          try {
            const properties = feature.properties || {};
            
            // Find name from possible fields
            let name = 'Ukjent';
            for (const field of config.nameField) {
              if (properties[field]) {
                name = properties[field];
                break;
              }
            }

            // Use OBJECTID or FID as external_id
            const externalId = properties.OBJECTID || properties.FID || properties.objectid || properties.fid || `${layerId}_${successCount}`;
            
            // Call upsert function
            const { data, error } = await supabase.rpc('upsert_geojson_feature', {
              p_table_name: config.table,
              p_external_id: String(externalId),
              p_name: name,
              p_description: null,
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
          total: geojson.features.length,
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
