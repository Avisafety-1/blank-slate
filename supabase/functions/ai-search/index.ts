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
    const [
      missions,
      incidents,
      documents,
      equipment,
      drones,
      competencies,
      sora,
      personnel,
      customers,
      news,
      flightLogs,
      calendarEvents
    ] = await Promise.all([
      // Missions - search in tittel, beskrivelse, lokasjon
      supabase
        .from('missions')
        .select('id, tittel, beskrivelse, lokasjon, status, tidspunkt')
        .eq('company_id', companyId)
        .or(`tittel.ilike.%${query}%,beskrivelse.ilike.%${query}%,lokasjon.ilike.%${query}%`)
        .limit(5),
      // Incidents
      supabase
        .from('incidents')
        .select('id, tittel, beskrivelse, kategori, alvorlighetsgrad, status')
        .eq('company_id', companyId)
        .or(`tittel.ilike.%${query}%,beskrivelse.ilike.%${query}%`)
        .limit(5),
      // Documents
      supabase
        .from('documents')
        .select('id, tittel, beskrivelse, kategori')
        .eq('company_id', companyId)
        .or(`tittel.ilike.%${query}%,beskrivelse.ilike.%${query}%`)
        .limit(5),
      // Equipment
      supabase
        .from('equipment')
        .select('id, navn, type, serienummer, status')
        .eq('company_id', companyId)
        .or(`navn.ilike.%${query}%,serienummer.ilike.%${query}%`)
        .limit(5),
      // Drones - fixed: use serienummer not registrering
      supabase
        .from('drones')
        .select('id, modell, serienummer, status')
        .eq('company_id', companyId)
        .or(`modell.ilike.%${query}%,serienummer.ilike.%${query}%`)
        .limit(5),
      // Competencies - with company filter via profile join
      supabase
        .from('personnel_competencies')
        .select('id, navn, type, beskrivelse, profile_id, profiles!inner(company_id)')
        .eq('profiles.company_id', companyId)
        .or(`navn.ilike.%${query}%,type.ilike.%${query}%,beskrivelse.ilike.%${query}%`)
        .limit(5),
      // SORA
      supabase
        .from('mission_sora')
        .select('id, mission_id, sora_status, conops_summary')
        .eq('company_id', companyId)
        .or(`conops_summary.ilike.%${query}%,operational_limits.ilike.%${query}%`)
        .limit(5),
      // Personnel/Profiles - NEW
      supabase
        .from('profiles')
        .select('id, full_name, email, tittel')
        .eq('company_id', companyId)
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%,tittel.ilike.%${query}%`)
        .limit(5),
      // Customers - NEW
      supabase
        .from('customers')
        .select('id, navn, kontaktperson, epost, adresse')
        .eq('company_id', companyId)
        .or(`navn.ilike.%${query}%,kontaktperson.ilike.%${query}%,epost.ilike.%${query}%,adresse.ilike.%${query}%`)
        .limit(5),
      // News - NEW
      supabase
        .from('news')
        .select('id, tittel, innhold, publisert, forfatter')
        .eq('company_id', companyId)
        .or(`tittel.ilike.%${query}%,innhold.ilike.%${query}%`)
        .limit(5),
      // Flight Logs - NEW
      supabase
        .from('flight_logs')
        .select('id, departure_location, landing_location, notes, flight_date, flight_duration_minutes')
        .eq('company_id', companyId)
        .or(`departure_location.ilike.%${query}%,landing_location.ilike.%${query}%,notes.ilike.%${query}%`)
        .limit(5),
      // Calendar Events - NEW
      supabase
        .from('calendar_events')
        .select('id, title, description, event_date, event_time, type')
        .eq('company_id', companyId)
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
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
Personell (${personnel.data?.length || 0}): ${personnel.data?.map(p => p.full_name).join(', ') || 'Ingen'}
Kunder (${customers.data?.length || 0}): ${customers.data?.map(c => c.navn).join(', ') || 'Ingen'}
Nyheter (${news.data?.length || 0}): ${news.data?.map(n => n.tittel).join(', ') || 'Ingen'}
Flylogger (${flightLogs.data?.length || 0}): ${flightLogs.data?.map(f => `${f.departure_location} → ${f.landing_location}`).join(', ') || 'Ingen'}
Kalender (${calendarEvents.data?.length || 0}): ${calendarEvents.data?.map(c => c.title).join(', ') || 'Ingen'}
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
          personnel: personnel.data || [],
          customers: customers.data || [],
          news: news.data || [],
          flightLogs: flightLogs.data || [],
          calendarEvents: calendarEvents.data || [],
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
