import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lat, lon, alt = 120 } = await req.json();
    
    if (lat === undefined || lon === undefined) {
      console.error('Missing required parameters: lat, lon');
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: lat, lon' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const safeskyApiKey = Deno.env.get('SAFESKY_API_KEY');
    if (!safeskyApiKey) {
      console.error('SAFESKY_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'SafeSky API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching SafeSky beacons for lat: ${lat}, lon: ${lon}, alt: ${alt}`);

    // SafeSky sandbox API endpoint for UAV data
    const safeskyUrl = `https://sandbox-public-api.safesky.app/v1/uav?lat=${lat}&lng=${lon}&alt=${alt}`;
    
    const response = await fetch(safeskyUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Avisafe/1.0 (kontakt@avisafe.no)',
        'x-api-key': safeskyApiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`SafeSky API error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: `SafeSky API error: ${response.status}`, details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log(`SafeSky returned ${Array.isArray(data) ? data.length : 0} beacons`);

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in safesky-beacons function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
