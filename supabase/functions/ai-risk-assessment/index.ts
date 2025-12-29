import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PilotInput {
  flightHeight: number;
  operationType: string;
  isVlos: boolean;
  observerCount: number;
  atcRequired: boolean;
  proximityToPeople: string;
  criticalInfrastructure: boolean;
  backupLandingAvailable: boolean;
  preflightCheckDone: boolean;
  rthProgrammed: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { missionId, pilotInputs, droneId } = await req.json();

    if (!missionId) {
      return new Response(JSON.stringify({ error: 'Mission ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting risk assessment for mission ${missionId}`);

    // 1. Fetch mission data
    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('*, mission_sora(*), customers(*)')
      .eq('id', missionId)
      .single();

    if (missionError || !mission) {
      console.error('Mission fetch error:', missionError);
      return new Response(JSON.stringify({ error: 'Mission not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch pilot profile and company
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const companyId = profile?.company_id;

    // 3. Fetch pilot competencies
    const { data: competencies } = await supabase
      .from('personnel_competencies')
      .select('*')
      .eq('profile_id', user.id);

    // 4. Fetch pilot flight logs (statistics)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: flightLogs } = await supabase
      .from('flight_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('flight_date', { ascending: false });

    const flightStats = {
      totalFlights: flightLogs?.length || 0,
      totalMinutes: flightLogs?.reduce((sum, log) => sum + (log.flight_duration_minutes || 0), 0) || 0,
      last30Days: flightLogs?.filter(log => new Date(log.flight_date) >= thirtyDaysAgo).length || 0,
      last90Days: flightLogs?.filter(log => new Date(log.flight_date) >= ninetyDaysAgo).length || 0,
      lastFlightDate: flightLogs?.[0]?.flight_date || null,
      flightsWithDrone: droneId ? flightLogs?.filter(log => log.drone_id === droneId).length || 0 : 0,
    };

    // 5. Fetch weather data if coordinates available
    let weatherData = null;
    const routeCoords = (mission.route as any)?.coordinates;
    const lat = mission.latitude ?? routeCoords?.[0]?.lat;
    const lng = mission.longitude ?? routeCoords?.[0]?.lng;

    if (lat && lng) {
      try {
        const weatherResponse = await fetch(`${supabaseUrl}/functions/v1/drone-weather`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ latitude: lat, longitude: lng }),
        });
        if (weatherResponse.ok) {
          weatherData = await weatherResponse.json();
        }
      } catch (e) {
        console.error('Weather fetch error:', e);
      }
    }

    // 6. Fetch airspace warnings
    let airspaceWarnings: any[] = [];
    if (lat && lng) {
      try {
        const { data: warnings } = await supabase.rpc('check_mission_airspace', {
          mission_lat: lat,
          mission_lng: lng,
          route_coords: routeCoords || null,
        });
        airspaceWarnings = warnings || [];
      } catch (e) {
        console.error('Airspace check error:', e);
      }
    }

    // 7. Fetch drone data if provided
    let droneData = null;
    if (droneId) {
      const { data: drone } = await supabase
        .from('drones')
        .select('*')
        .eq('id', droneId)
        .single();
      droneData = drone;
    }

    // 8. Build AI prompt
    const today = new Date();
    const validCompetencies = competencies?.filter(c => 
      !c.utloper_dato || new Date(c.utloper_dato) > today
    ) || [];
    const expiredCompetencies = competencies?.filter(c => 
      c.utloper_dato && new Date(c.utloper_dato) <= today
    ) || [];

    const daysSinceLastFlight = flightStats.lastFlightDate 
      ? Math.floor((today.getTime() - new Date(flightStats.lastFlightDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const contextData = {
      mission: {
        title: mission.tittel,
        location: mission.lokasjon,
        description: mission.beskrivelse,
        scheduledTime: mission.tidspunkt,
        endTime: mission.slutt_tidspunkt,
        riskLevel: mission.risk_nivå,
        route: mission.route,
        sora: mission.mission_sora?.[0],
      },
      weather: weatherData ? {
        current: weatherData.current,
        warnings: weatherData.warnings,
        recommendation: weatherData.droneFlightRecommendation,
        bestWindow: weatherData.bestFlightWindow,
      } : null,
      airspace: {
        warnings: airspaceWarnings.map((w: any) => ({
          type: w.type,
          name: w.name,
          distance: w.distance,
          inside: w.inside,
          level: w.level,
          message: w.message,
        })),
      },
      pilot: {
        name: profile?.full_name,
        totalFlightHours: profile?.flyvetimer || 0,
        totalFlights: flightStats.totalFlights,
        flightsLast30Days: flightStats.last30Days,
        flightsLast90Days: flightStats.last90Days,
        daysSinceLastFlight,
        flightsWithThisDrone: flightStats.flightsWithDrone,
        validCompetencies: validCompetencies.map(c => ({ name: c.navn, type: c.type, expires: c.utloper_dato })),
        expiredCompetencies: expiredCompetencies.map(c => ({ name: c.navn, type: c.type, expired: c.utloper_dato })),
      },
      equipment: droneData ? {
        model: droneData.modell,
        status: droneData.status,
        flightHours: droneData.flyvetimer,
        lastInspection: droneData.sist_inspeksjon,
        nextInspection: droneData.neste_inspeksjon,
        available: droneData.tilgjengelig,
      } : null,
      pilotInputs: pilotInputs || {},
    };

    const systemPrompt = `Du er en ekspert på droneflyging og risikovurdering i Norge. Analyser følgende data og gi en strukturert risikovurdering.

Du skal vurdere 5 kategorier på en skala fra 1 (høy risiko) til 10 (lav risiko):
1. Vær (weather_score)
2. Luftrom (airspace_score)  
3. Piloterfaring (pilot_experience_score)
4. Oppdragskompleksitet (mission_complexity_score)
5. Utstyr (equipment_score)

Basert på disse, gi en samlet vurdering (overall_score) og en anbefaling ('go', 'caution', eller 'no-go').

VIKTIG: Svar ALLTID på norsk. Returner KUN gyldig JSON uten markdown-formatering.`;

    const userPrompt = `Analyser denne droneoppdrag-risikovurderingen:

${JSON.stringify(contextData, null, 2)}

Returner en JSON-respons med denne strukturen:
{
  "overall_score": <number 1-10>,
  "recommendation": "<go|caution|no-go>",
  "summary": "<kort oppsummering på norsk>",
  "categories": {
    "weather": {
      "score": <number 1-10>,
      "factors": ["<positive faktorer>"],
      "concerns": ["<bekymringer>"]
    },
    "airspace": {
      "score": <number 1-10>,
      "factors": ["<positive faktorer>"],
      "concerns": ["<bekymringer>"]
    },
    "pilot_experience": {
      "score": <number 1-10>,
      "factors": ["<positive faktorer>"],
      "concerns": ["<bekymringer>"]
    },
    "mission_complexity": {
      "score": <number 1-10>,
      "factors": ["<positive faktorer>"],
      "concerns": ["<bekymringer>"]
    },
    "equipment": {
      "score": <number 1-10>,
      "factors": ["<positive faktorer>"],
      "concerns": ["<bekymringer>"]
    }
  },
  "recommendations": [
    {
      "priority": "<high|medium|low>",
      "action": "<konkret tiltak på norsk>",
      "reason": "<begrunnelse på norsk>"
    }
  ],
  "go_conditions": ["<betingelser som må være oppfylt for trygg flyging>"]
}`;

    // 9. Call AI
    console.log('Calling AI for risk assessment...');
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again later' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted, please add funds' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    let aiContent = aiData.choices?.[0]?.message?.content;
    
    if (!aiContent) {
      throw new Error('No content in AI response');
    }

    // Parse JSON from AI response (remove markdown if present)
    aiContent = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let aiAnalysis;
    try {
      aiAnalysis = JSON.parse(aiContent);
    } catch (e) {
      console.error('Failed to parse AI response:', aiContent);
      throw new Error('Invalid AI response format');
    }

    console.log('AI analysis complete:', aiAnalysis.recommendation);

    // 10. Save to database
    const { data: savedAssessment, error: saveError } = await supabase
      .from('mission_risk_assessments')
      .insert({
        mission_id: missionId,
        pilot_id: user.id,
        company_id: companyId,
        weather_score: aiAnalysis.categories?.weather?.score || null,
        airspace_score: aiAnalysis.categories?.airspace?.score || null,
        pilot_experience_score: aiAnalysis.categories?.pilot_experience?.score || null,
        mission_complexity_score: aiAnalysis.categories?.mission_complexity?.score || null,
        equipment_score: aiAnalysis.categories?.equipment?.score || null,
        overall_score: aiAnalysis.overall_score,
        recommendation: aiAnalysis.recommendation,
        ai_analysis: aiAnalysis,
        pilot_inputs: pilotInputs || {},
        weather_data: weatherData,
        airspace_warnings: airspaceWarnings,
      })
      .select()
      .single();

    if (saveError) {
      console.error('Save error:', saveError);
      // Still return the analysis even if save fails
    }

    return new Response(JSON.stringify({
      success: true,
      assessment: savedAssessment || {
        ...aiAnalysis,
        weather_data: weatherData,
        airspace_warnings: airspaceWarnings,
      },
      aiAnalysis,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Risk assessment error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
