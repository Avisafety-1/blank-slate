import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, userId } = await req.json();
    
    if (!query || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing query or userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's company_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', userId)
      .single();

    if (!profile) {
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const companyId = profile.company_id;

    // Search across all relevant tables
    const [missions, incidents, documents, equipment, drones, competencies, sora] = await Promise.all([
      supabase
        .from('missions')
        .select('id, tittel, beskrivelse, lokasjon, status, tidspunkt')
        .eq('company_id', companyId)
        .ilike('tittel', `%${query}%`)
        .limit(5),
      supabase
        .from('incidents')
        .select('id, tittel, beskrivelse, kategori, alvorlighetsgrad, status')
        .eq('company_id', companyId)
        .or(`tittel.ilike.%${query}%,beskrivelse.ilike.%${query}%`)
        .limit(5),
      supabase
        .from('documents')
        .select('id, tittel, beskrivelse, kategori')
        .eq('company_id', companyId)
        .or(`tittel.ilike.%${query}%,beskrivelse.ilike.%${query}%`)
        .limit(5),
      supabase
        .from('equipment')
        .select('id, navn, type, serienummer, status')
        .eq('company_id', companyId)
        .or(`navn.ilike.%${query}%,serienummer.ilike.%${query}%`)
        .limit(5),
      supabase
        .from('drones')
        .select('id, modell, registrering, status')
        .eq('company_id', companyId)
        .or(`modell.ilike.%${query}%,registrering.ilike.%${query}%`)
        .limit(5),
      supabase
        .from('personnel_competencies')
        .select('id, navn, type, beskrivelse, profile_id')
        .or(`navn.ilike.%${query}%,type.ilike.%${query}%,beskrivelse.ilike.%${query}%`)
        .limit(5),
      supabase
        .from('mission_sora')
        .select('id, mission_id, sora_status, conops_summary')
        .eq('company_id', companyId)
        .or(`conops_summary.ilike.%${query}%,operational_limits.ilike.%${query}%`)
        .limit(5),
    ]);

    // Use AI to generate a summary of results
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const resultsContext = `
Søkeresultater for "${query}":

Oppdrag (${missions.data?.length || 0}): ${missions.data?.map(m => m.tittel).join(', ') || 'Ingen'}
Hendelser (${incidents.data?.length || 0}): ${incidents.data?.map(i => i.tittel).join(', ') || 'Ingen'}
Dokumenter (${documents.data?.length || 0}): ${documents.data?.map(d => d.tittel).join(', ') || 'Ingen'}
Utstyr (${equipment.data?.length || 0}): ${equipment.data?.map(e => e.navn).join(', ') || 'Ingen'}
Droner (${drones.data?.length || 0}): ${drones.data?.map(d => d.modell).join(', ') || 'Ingen'}
Kompetanse (${competencies.data?.length || 0}): ${competencies.data?.map(c => c.navn).join(', ') || 'Ingen'}
SORA-analyser (${sora.data?.length || 0})
`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Du er en assistent som hjelper til med å oppsummere søkeresultater. Svar kort og konsist på norsk.'
          },
          {
            role: 'user',
            content: `Lag en kort oppsummering (maks 2 setninger) av disse søkeresultatene:\n\n${resultsContext}`
          }
        ],
      }),
    });

    let aiSummary = '';
    if (aiResponse.ok) {
      const aiData = await aiResponse.json();
      aiSummary = aiData.choices[0]?.message?.content || '';
    }

    return new Response(
      JSON.stringify({
        summary: aiSummary,
        results: {
          missions: missions.data || [],
          incidents: incidents.data || [],
          documents: documents.data || [],
          equipment: equipment.data || [],
          drones: drones.data || [],
          competencies: competencies.data || [],
          sora: sora.data || [],
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-search:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
