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
  skipWeatherEvaluation: boolean;
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

    // 1. Fetch mission data with related entities
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

    // 2. Fetch assigned personnel for the mission
    const { data: missionPersonnel, error: missionPersonnelError } = await supabase
      .from('mission_personnel')
      .select('profile_id, profiles(id, full_name, flyvetimer, tittel, email, telefon)')
      .eq('mission_id', missionId);

    if (missionPersonnelError) {
      console.error('Mission personnel fetch error:', missionPersonnelError);
    }

    const assignedPilots = missionPersonnel?.map((mp: any) => mp.profiles).filter(Boolean) || [];
    console.log(`Found ${assignedPilots.length} assigned personnel for mission`);
    if ((missionPersonnel?.length || 0) > 0 && assignedPilots.length === 0) {
      console.log('mission_personnel rows exist, but joined profiles were empty. Sample row:', missionPersonnel?.[0]);
    }
    // 3. Fetch assigned drones for the mission
    const { data: missionDrones } = await supabase
      .from('mission_drones')
      .select('drone_id, drones(*)')
      .eq('mission_id', missionId);

    const assignedDrones = missionDrones?.map(md => md.drones).filter(Boolean) || [];
    console.log(`Found ${assignedDrones.length} assigned drones for mission`);

    // 4. Fetch assigned equipment for the mission
    const { data: missionEquipment } = await supabase
      .from('mission_equipment')
      .select('equipment_id, equipment(*)')
      .eq('mission_id', missionId);

    const assignedEquipment = missionEquipment?.map(me => me.equipment).filter(Boolean) || [];
    console.log(`Found ${assignedEquipment.length} assigned equipment for mission`);

    // 5. Get current user's profile and company
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const companyId = profile?.company_id;

    // 6. Fetch competencies for all assigned pilots
    const pilotIds = assignedPilots.map((p: any) => p.id);
    let allCompetencies: any[] = [];
    if (pilotIds.length > 0) {
      const { data: competencies } = await supabase
        .from('personnel_competencies')
        .select('*')
        .in('profile_id', pilotIds);
      allCompetencies = competencies || [];
    }

    // 7. Fetch flight logs for assigned pilots
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    let allFlightLogs: any[] = [];
    if (pilotIds.length > 0) {
      const { data: flightLogs } = await supabase
        .from('flight_logs')
        .select('*')
        .in('user_id', pilotIds)
        .order('flight_date', { ascending: false });
      allFlightLogs = flightLogs || [];
    }

    // Build flight stats per pilot
    const pilotFlightStats = pilotIds.map((pilotId: string) => {
      const pilotLogs = allFlightLogs.filter(log => log.user_id === pilotId);
      return {
        pilotId,
        totalFlights: pilotLogs.length,
        totalMinutes: pilotLogs.reduce((sum, log) => sum + (log.flight_duration_minutes || 0), 0),
        last30Days: pilotLogs.filter(log => new Date(log.flight_date) >= thirtyDaysAgo).length,
        last90Days: pilotLogs.filter(log => new Date(log.flight_date) >= ninetyDaysAgo).length,
        lastFlightDate: pilotLogs[0]?.flight_date || null,
      };
    });

    // 8. Fetch weather data if coordinates available and not skipped
    let weatherData = null;
    const routeCoords = (mission.route as any)?.coordinates;
    const lat = mission.latitude ?? routeCoords?.[0]?.lat;
    const lng = mission.longitude ?? routeCoords?.[0]?.lng;
    
    const skipWeather = pilotInputs?.skipWeatherEvaluation === true;

    if (skipWeather) {
      console.log('Weather evaluation skipped by user request');
    } else {
      console.log(`Fetching weather for coordinates: lat=${lat}, lon=${lng}`);

      if (lat && lng) {
        try {
          const weatherResponse = await fetch(`${supabaseUrl}/functions/v1/drone-weather`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ lat, lon: lng }),
          });
          if (weatherResponse.ok) {
            weatherData = await weatherResponse.json();
            console.log(`Weather data fetched successfully: ${weatherData?.current?.temperature}°C, wind ${weatherData?.current?.wind_speed} m/s`);
          } else {
            console.error('Weather fetch failed:', weatherResponse.status, await weatherResponse.text());
          }
        } catch (e) {
          console.error('Weather fetch error:', e);
        }
      } else {
        console.log('No coordinates available for weather fetch');
      }
    }

    // 9. Fetch airspace warnings
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

    // Use provided droneId or first assigned drone
    const effectiveDroneId = droneId || (assignedDrones[0] as any)?.id;
    const droneData: any = effectiveDroneId 
      ? assignedDrones.find((d: any) => d.id === effectiveDroneId) || assignedDrones[0]
      : null;

    // 10. Build AI prompt
    const today = new Date();
    const validCompetencies = allCompetencies.filter((c: any) => 
      !c.utloper_dato || new Date(c.utloper_dato) > today
    );
    const expiredCompetencies = allCompetencies.filter((c: any) => 
      c.utloper_dato && new Date(c.utloper_dato) <= today
    );

    // Aggregate flight stats for all assigned pilots
    const aggregatedFlightStats = {
      totalFlights: pilotFlightStats.reduce((sum, s) => sum + s.totalFlights, 0),
      totalMinutes: pilotFlightStats.reduce((sum, s) => sum + s.totalMinutes, 0),
      last30Days: pilotFlightStats.reduce((sum, s) => sum + s.last30Days, 0),
      last90Days: pilotFlightStats.reduce((sum, s) => sum + s.last90Days, 0),
      lastFlightDate: pilotFlightStats.map(s => s.lastFlightDate).filter(Boolean).sort().reverse()[0] || null,
      flightsWithDrone: effectiveDroneId ? allFlightLogs.filter(log => log.drone_id === effectiveDroneId).length : 0,
    };

    const daysSinceLastFlight = aggregatedFlightStats.lastFlightDate 
      ? Math.floor((today.getTime() - new Date(aggregatedFlightStats.lastFlightDate).getTime()) / (1000 * 60 * 60 * 24))
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
        customer: mission.customers?.navn,
      },
      weather: skipWeather ? { 
        skipped: true, 
        note: 'Værvurdering hoppet over etter brukerønske' 
      } : (weatherData ? {
        current: weatherData.current,
        warnings: weatherData.warnings,
        recommendation: weatherData.droneFlightRecommendation,
        bestWindow: weatherData.bestFlightWindow,
      } : null),
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
      assignedPilots: assignedPilots.map((p: any) => ({
        name: p.full_name,
        role: p.rolle,
        totalFlightHours: p.flyvetimer || 0,
      })),
      pilotStats: {
        totalAssignedPilots: assignedPilots.length,
        totalFlights: aggregatedFlightStats.totalFlights,
        flightsLast30Days: aggregatedFlightStats.last30Days,
        flightsLast90Days: aggregatedFlightStats.last90Days,
        daysSinceLastFlight,
        flightsWithThisDrone: aggregatedFlightStats.flightsWithDrone,
        validCompetencies: validCompetencies.map((c: any) => ({ name: c.navn, type: c.type, expires: c.utloper_dato })),
        expiredCompetencies: expiredCompetencies.map((c: any) => ({ name: c.navn, type: c.type, expired: c.utloper_dato })),
      },
      assignedDrones: assignedDrones.map((d: any) => ({
        model: d.modell,
        serialNumber: d.serienummer,
        status: d.status,
        flightHours: d.flyvetimer,
        lastInspection: d.sist_inspeksjon,
        nextInspection: d.neste_inspeksjon,
        available: d.tilgjengelig,
        class: d.klasse,
      })),
      assignedEquipment: assignedEquipment.map((e: any) => ({
        name: e.navn,
        type: e.type,
        status: e.status,
        serialNumber: e.serienummer,
        lastMaintenance: e.sist_vedlikeholdt,
        nextMaintenance: e.neste_vedlikehold,
        available: e.tilgjengelig,
      })),
      primaryDrone: droneData ? {
        model: droneData.modell,
        status: droneData.status,
        flightHours: droneData.flyvetimer,
        lastInspection: droneData.sist_inspeksjon,
        nextInspection: droneData.neste_inspeksjon,
        available: droneData.tilgjengelig,
        class: droneData.klasse,
      } : null,
      pilotInputs: pilotInputs || {},
    };

    // Professional SMS System Prompt
    const systemPrompt = `Du er en profesjonell Safety Management System (SMS)-assistent for UAS-operasjoner.

Din oppgave er å gjennomføre en strukturert, revisjonsvennlig og beslutningsstøttende risikovurdering for et droneoppdrag i AviSafe, i tråd med EASA-prinsipper, god SMS-praksis og Human Factors.

### GENERELLE KRAV
- Skill tydelig mellom:
  • Faktiske inputdata
  • Regel-/systemkrav
  • Operative antakelser
  • AI-baserte vurderinger
- Vurder risiko konservativt.
- Bruk klart og profesjonelt språk egnet for operative beslutninger og tilsyn.
- Dersom kritiske terskler overskrides, skal AI bruke "HARD STOP"-logikk som overstyrer numerisk score.

### HARD STOP-LOGIKK
Du SKAL returnere recommendation="no-go" og hard_stop_triggered=true hvis:
1. VÆR: Vindstyrke (middelvind) > 10 m/s ELLER vindkast > 15 m/s ELLER sikt < 1 km ELLER kraftig nedbør
2. UTSTYR: Drone eller kritisk utstyr har status "Gul" eller "Rød" (ikke Grønn)
3. PILOT: Ingen gyldige kompetanser eller alle påkrevde sertifikater er utløpt

VIKTIG: Høy piloterfaring kan IKKE kompensere for tekniske eller meteorologiske overskridelser. HARD STOP skal utløses uavhengig av andre scores.

### FORUTSETNINGER
Anta alltid at piloten vil:
- Utføre pre-flight sjekk før avgang
- Programmere RTH (Return to Home)
- Gjennomføre visuell inspeksjon av dronen
Disse skal kommenteres som forutsetninger i prerequisites.

${skipWeather ? '### VÆR-MERKNAD\nBruker har valgt å hoppe over værvurdering. Sett weather.score til 7, weather.go_decision til "BETINGET", og noter at vær må vurderes separat før flyging.' : ''}

### RESPONS-FORMAT
Returner KUN gyldig JSON uten markdown-formatering. Svar ALLTID på norsk.`;

    const userPrompt = `Analyser denne droneoppdrag-risikovurderingen:

${JSON.stringify(contextData, null, 2)}

Returner en JSON-respons med denne strukturen:
{
  "mission_overview": "<kort oppsummering av oppdragets formål, lokasjon og operasjonstype>",
  "assessment_method": "<kort forklaring av vurderingsmetoden, vekting og HARD STOP-logikk>",
  "overall_score": <number 1-10>,
  "recommendation": "<go|caution|no-go>",
  "hard_stop_triggered": <boolean>,
  "hard_stop_reason": "<årsak hvis hard_stop_triggered er true, ellers null>",
  "summary": "<kort oppsummering på norsk>",
  "categories": {
    "weather": {
      "score": <number 1-10>,
      "go_decision": "<GO|BETINGET|NO-GO>",
      "actual_conditions": "<beskrivelse av faktiske værdata>",
      "comparison_to_limits": "<sammenligning mot sikkerhetsgrenser>",
      "factors": ["<positive faktorer>"],
      "concerns": ["<bekymringer>"]
    },
    "airspace": {
      "score": <number 1-10>,
      "go_decision": "<GO|BETINGET|NO-GO>",
      "actual_conditions": "<beskrivelse av luftromsforhold>",
      "factors": ["<positive faktorer>"],
      "concerns": ["<bekymringer>"]
    },
    "equipment": {
      "score": <number 1-10>,
      "go_decision": "<GO|BETINGET|NO-GO>",
      "status": "<green|yellow|red>",
      "drone_status": "<beskrivelse av dronestatus og vedlikehold>",
      "factors": ["<positive faktorer>"],
      "concerns": ["<bekymringer>"]
    },
    "pilot_experience": {
      "score": <number 1-10>,
      "go_decision": "<GO|BETINGET|NO-GO>",
      "experience_summary": "<beskrivelse av erfaring og kompetanse>",
      "factors": ["<positive faktorer>"],
      "concerns": ["<bekymringer>"]
    },
    "mission_complexity": {
      "score": <number 1-10>,
      "go_decision": "<GO|BETINGET|NO-GO>",
      "complexity_factors": "<vurdering av oppdragstype, terreng, lysforhold>",
      "factors": ["<positive faktorer>"],
      "concerns": ["<bekymringer>"]
    }
  },
  "recommendations": [
    {
      "priority": "<high|medium|low>",
      "action": "<konkret tiltak på norsk>",
      "risk_addressed": "<hvilken risiko tiltaket reduserer>"
    }
  ],
  "prerequisites": ["<betingelser som må være oppfylt før flyging>"],
  "ai_disclaimer": "Vurderingen er basert på tilgjengelige data på vurderingstidspunktet. Endringer i input kan påvirke resultatet."
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

    console.log('AI analysis complete:', aiAnalysis.recommendation, 'HARD STOP:', aiAnalysis.hard_stop_triggered);

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
