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

    const { missionId, pilotInputs, droneId, soraReassessment, previousAnalysis, pilotComments } = await req.json();

    if (!missionId) {
      return new Response(JSON.stringify({ error: 'Mission ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting risk assessment for mission ${missionId}${soraReassessment ? ' (SORA re-assessment)' : ''}`);

    // Handle SORA re-assessment mode
    if (soraReassessment && previousAnalysis && pilotComments) {
      console.log('Running SORA re-assessment with pilot comments');

      const soraSystemPrompt = `Du er en SORA-spesialist (Specific Operations Risk Assessment) for UAS-operasjoner i henhold til EASA-rammeverket.

Du mottar en opprinnelig AI-risikovurdering og brukerens manuelle mitigeringer/forklaringer for 5 risikokategorier.
Din oppgave er å produsere en strukturert SORA-analyse basert på all tilgjengelig informasjon.

### RESPONS-FORMAT
Returner KUN gyldig JSON uten markdown-formatering. Svar ALLTID på norsk.

Returner denne JSON-strukturen:
{
  "environment": "<Tettbygd|Landlig|Sjø|Industriområde|Annet>",
  "conops_summary": "<ConOps-beskrivelse basert på oppdragets data og mitigeringer>",
  "igrc": <number 1-7>,
  "ground_mitigations": "<beskrivelse av bakkemitigeringer basert på brukerens kommentarer og AI-analyse>",
  "fgrc": <number 1-7>,
  "arc_initial": "<ARC-A|ARC-B|ARC-C|ARC-D>",
  "airspace_mitigations": "<beskrivelse av luftromsmitigeringer>",
  "arc_residual": "<ARC-A|ARC-B|ARC-C|ARC-D>",
  "sail": "<SAIL I|SAIL II|SAIL III|SAIL IV|SAIL V|SAIL VI>",
  "residual_risk_level": "<Lav|Moderat|Høy>",
  "residual_risk_comment": "<vurdering av rest-risiko etter alle mitigeringer>",
  "operational_limits": "<operative begrensninger og betingelser>",
  "overall_score": <number 1-10>,
  "recommendation": "<go|caution|no-go>",
  "summary": "<kort oppsummering av SORA-vurderingen>"
}

### VURDERINGSPRINSIPPER
- iGRC bestemmes av operasjonsmiljø og dronens egenskaper (vekt, hastighet)
- fGRC = iGRC justert ned basert på bakkemitigeringer (sperringer, ERP, fallskjerm)
- ARC bestemmes av luftromstype og trafikktetthet
- SAIL = kombinasjon av fGRC og residual ARC (SAIL-matrisen)
- Vurder brukerens kommentarer som faktiske mitigeringer implementert av operatøren
- Vær konservativ i vurderingen`;

      const soraUserPrompt = `Generer en SORA-analyse basert på følgende data:

### Opprinnelig AI-risikovurdering:
${JSON.stringify(previousAnalysis, null, 2)}

### Brukerens mitigeringer/kommentarer per kategori:
${JSON.stringify(pilotComments, null, 2)}

Analyser dataene og produser en komplett SORA-vurdering.`;

      const soraAiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: soraSystemPrompt },
            { role: 'user', content: soraUserPrompt },
          ],
        }),
      });

      if (!soraAiResponse.ok) {
        const errorText = await soraAiResponse.text();
        console.error('SORA AI gateway error:', soraAiResponse.status, errorText);
        if (soraAiResponse.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (soraAiResponse.status === 402) {
          return new Response(JSON.stringify({ error: 'AI credits exhausted' }), {
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`AI gateway error: ${soraAiResponse.status}`);
      }

      const soraAiData = await soraAiResponse.json();
      let soraContent = soraAiData.choices?.[0]?.message?.content;
      if (!soraContent) throw new Error('No content in SORA AI response');

      soraContent = soraContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      let soraAnalysis;
      try {
        soraAnalysis = JSON.parse(soraContent);
      } catch (e) {
        console.error('Failed to parse SORA AI response:', soraContent);
        throw new Error('Invalid SORA AI response format');
      }

      console.log('SORA analysis complete:', soraAnalysis.sail, soraAnalysis.residual_risk_level);

      // Get user's profile for company_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      const companyId = profile?.company_id;

      // Save SORA output to mission_risk_assessments
      const { data: savedAssessment, error: saveError } = await supabase
        .from('mission_risk_assessments')
        .insert({
          mission_id: missionId,
          pilot_id: user.id,
          company_id: companyId,
          weather_score: previousAnalysis.categories?.weather?.score || null,
          airspace_score: previousAnalysis.categories?.airspace?.score || null,
          pilot_experience_score: previousAnalysis.categories?.pilot_experience?.score || null,
          mission_complexity_score: previousAnalysis.categories?.mission_complexity?.score || null,
          equipment_score: previousAnalysis.categories?.equipment?.score || null,
          overall_score: soraAnalysis.overall_score || previousAnalysis.overall_score,
          recommendation: soraAnalysis.recommendation || previousAnalysis.recommendation,
          ai_analysis: previousAnalysis,
          pilot_comments: pilotComments,
          sora_output: soraAnalysis,
        })
        .select()
        .single();

      if (saveError) {
        console.error('Save SORA assessment error:', saveError);
      }

      // Upsert to mission_sora table
      if (companyId) {
        const { error: soraUpsertError } = await supabase
          .from('mission_sora')
          .upsert({
            mission_id: missionId,
            company_id: companyId,
            environment: soraAnalysis.environment || null,
            conops_summary: soraAnalysis.conops_summary || null,
            igrc: soraAnalysis.igrc || null,
            ground_mitigations: soraAnalysis.ground_mitigations || null,
            fgrc: soraAnalysis.fgrc || null,
            arc_initial: soraAnalysis.arc_initial || null,
            airspace_mitigations: soraAnalysis.airspace_mitigations || null,
            arc_residual: soraAnalysis.arc_residual || null,
            sail: soraAnalysis.sail || null,
            residual_risk_level: soraAnalysis.residual_risk_level || null,
            residual_risk_comment: soraAnalysis.residual_risk_comment || null,
            operational_limits: soraAnalysis.operational_limits || null,
            sora_status: 'Under arbeid',
            prepared_by: user.id,
            prepared_at: new Date().toISOString(),
          }, { onConflict: 'mission_id', ignoreDuplicates: false });

        if (soraUpsertError) {
          console.error('SORA upsert error:', soraUpsertError);
        } else {
          console.log('SORA data synced to mission_sora table');
        }
      }

      return new Response(JSON.stringify({
        success: true,
        assessment: savedAssessment,
        soraAnalysis,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
    // GDPR: Only fetch non-personal data needed for risk assessment (no names, email, phone)
    const { data: missionPersonnel, error: missionPersonnelError } = await supabase
      .from('mission_personnel')
      .select('profile_id, profiles(id, flyvetimer, tittel)')
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

    // 8b. Fetch solar/geomagnetic activity (Kp-index) from NOAA SWPC
    let solarActivity: { kpIndex: number; noaaScale: string; level: string } | null = null;
    try {
      const kpRes = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', {
        signal: AbortSignal.timeout(5000),
      });
      if (kpRes.ok) {
        const kpRaw: string[][] = await kpRes.json();
        // Format: [["time_tag","Kp","observed","noaa_scale"], ["2026-03-25 00:00:00","2.33","observed","0"], ...]
        // Find highest Kp for mission date
        // Extract date from mission.tidspunkt (ISO timestamp) or fall back to today
        const missionDateStr = mission.tidspunkt
          ? new Date(mission.tidspunkt).toISOString().substring(0, 10)
          : new Date().toISOString().substring(0, 10);
        let maxKp = 0;
        let matchedDate = false;
        for (let i = 1; i < kpRaw.length; i++) {
          const row = kpRaw[i];
          if (!row || row.length < 2) continue;
          const rowDate = (row[0] || '').substring(0, 10);
          const kpVal = parseFloat(row[1]);
          if (rowDate === missionDateStr && !isNaN(kpVal) && kpVal > maxKp) {
            maxKp = kpVal;
            matchedDate = true;
          }
        }
        // If no data for mission date, check tomorrow as fallback (forecast)
        if (!matchedDate) {
          const tomorrow = new Date(missionDateStr);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = tomorrow.toISOString().substring(0, 10);
          for (let i = 1; i < kpRaw.length; i++) {
            const row = kpRaw[i];
            if (!row || row.length < 2) continue;
            const rowDate = (row[0] || '').substring(0, 10);
            const kpVal = parseFloat(row[1]);
            if ((rowDate === missionDateStr || rowDate === tomorrowStr) && !isNaN(kpVal) && kpVal > maxKp) {
              maxKp = kpVal;
            }
          }
        }
        const roundedKp = Math.round(maxKp * 10) / 10;
        let noaaScale = 'G0';
        let level = 'low';
        if (roundedKp >= 9) { noaaScale = 'G5'; level = 'extreme'; }
        else if (roundedKp >= 8) { noaaScale = 'G4'; level = 'severe'; }
        else if (roundedKp >= 7) { noaaScale = 'G3'; level = 'strong'; }
        else if (roundedKp >= 6) { noaaScale = 'G2'; level = 'moderate'; }
        else if (roundedKp >= 5) { noaaScale = 'G1'; level = 'minor'; }

        solarActivity = { kpIndex: roundedKp, noaaScale, level };
        console.log(`Solar activity: Kp=${roundedKp}, scale=${noaaScale}, level=${level}`);
      }
    } catch (e) {
      console.error('Solar activity fetch error (non-blocking):', e);
    }

    // 9. Fetch airspace warnings
    let airspaceWarnings: any[] = [];
    if (lat && lng) {
      try {
        console.log(`Checking airspace for coordinates: lat=${lat}, lon=${lng}`);
        const { data: warnings, error: airspaceError } = await supabase.rpc('check_mission_airspace', {
          p_lat: lat,
          p_lng: lng,
          p_route: routeCoords ? JSON.parse(JSON.stringify(routeCoords)) : null,
        });
        if (airspaceError) {
          console.error('Airspace check RPC error:', airspaceError);
        } else {
          airspaceWarnings = warnings || [];
          console.log(`Airspace warnings found: ${airspaceWarnings.length}`, JSON.stringify(airspaceWarnings));
        }
      } catch (e) {
        console.error('Airspace check error:', e);
      }
    }

    // 9b. Fetch SSB Arealbruk (land use) data for ground risk classification
    let landUseData: { categories: string[]; groundRiskClassification: string; summary: string; featureCount: Record<string, number> } | null = null;
    if (lat && lng) {
      try {
        // Build bounding box from route coordinates or single point
        const allCoords: { lat: number; lng: number }[] = routeCoords && routeCoords.length > 0
          ? routeCoords
          : [{ lat, lng }];

        // Get SORA ground risk buffer distance if available
        const soraData = mission.mission_sora?.[0];
        const bufferMeters = soraData?.ground_risk_distance
          ? (soraData.contingency_distance || 50) + soraData.ground_risk_distance
          : allCoords.length === 1 ? 500 : 200;

        // Calculate bounding box with buffer
        const degPerMeterLat = 1 / 111320;
        const avgLat = allCoords.reduce((s, c) => s + c.lat, 0) / allCoords.length;
        const degPerMeterLng = 1 / (111320 * Math.cos(avgLat * Math.PI / 180));

        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        for (const c of allCoords) {
          if (c.lat < minLat) minLat = c.lat;
          if (c.lat > maxLat) maxLat = c.lat;
          if (c.lng < minLng) minLng = c.lng;
          if (c.lng > maxLng) maxLng = c.lng;
        }
        minLat -= bufferMeters * degPerMeterLat;
        maxLat += bufferMeters * degPerMeterLat;
        minLng -= bufferMeters * degPerMeterLng;
        maxLng += bufferMeters * degPerMeterLng;

        const wfsUrl = `https://wfs.geonorge.no/skwms1/wfs.arealbruk?service=WFS&version=2.0.0&request=GetFeature&typeName=app:SsbArealbrukFlate&srsName=EPSG:4326&bbox=${minLng},${minLat},${maxLng},${maxLat},EPSG:4326&count=200`;
        console.log(`Fetching SSB Arealbruk WFS: bbox=${minLng.toFixed(5)},${minLat.toFixed(5)},${maxLng.toFixed(5)},${maxLat.toFixed(5)}`);

        const wfsResponse = await fetch(wfsUrl, { signal: AbortSignal.timeout(8000) });
        if (wfsResponse.ok) {
          const xmlText = await wfsResponse.text();
          
          // Parse XML/GML response using regex to extract land use categories
          const arealbrukMatches = [...xmlText.matchAll(/<app:arealbruksomrade>(.*?)<\/app:arealbruksomrade>/g)].map(m => m[1]);
          const bebyggelseMatches = [...xmlText.matchAll(/<app:bebyggelsestype>(.*?)<\/app:bebyggelsestype>/g)].map(m => m[1]);
          const allCategories = [...arealbrukMatches, ...bebyggelseMatches];
          console.log(`SSB Arealbruk: ${arealbrukMatches.length} features returned, categories: ${[...new Set(allCategories)].join(', ')}`);

          // Count categories
          const featureCount: Record<string, number> = {};
          for (const cat of arealbrukMatches) {
            featureCount[cat] = (featureCount[cat] || 0) + 1;
          }
          for (const cat of bebyggelseMatches) {
            const key = `Bebyggelse:${cat}`;
            featureCount[key] = (featureCount[key] || 0) + 1;
          }

          // Classify ground risk based on SSB categories
          const allCatsLower = allCategories.map(c => c.toLowerCase());
          const hasBolig = allCatsLower.some(c => c === 'bolig' || c === 'beb' || c === 'frittliggende' || c === 'rekkehus' || c === 'blokk');
          const hasOffentlig = allCatsLower.some(c => c === 'offentligprivattjenesteyting' || c === 'skole' || c === 'sykehus');
          const hasNaering = allCatsLower.some(c => c === 'naering' || c === 'handel');
          const hasIndustri = allCatsLower.some(c => c === 'industri' || c === 'lager');
          const hasTransport = allCatsLower.some(c => c === 'transporttelek' || c === 'annenveg' || c === 'jernbane');
          const hasFritid = allCatsLower.some(c => c === 'fritid' || c === 'idrett' || c === 'park');

          let groundRiskClassification = 'low';
          let summary = 'Området inneholder hovedsakelig ubebygde/fritidsområder med lav befolkningstetthet.';

          if (hasBolig || hasOffentlig) {
            groundRiskClassification = 'high';
            const types: string[] = [];
            if (hasBolig) types.push('boligområder');
            if (hasOffentlig) types.push('offentlige tjenester/institusjoner');
            if (hasNaering) types.push('næringsbebyggelse');
            summary = `Området inneholder ${types.join(', ')} — høy befolkningstetthet, forhøyet ground risk.`;
          } else if (hasNaering || hasIndustri || hasTransport) {
            groundRiskClassification = 'moderate';
            const types: string[] = [];
            if (hasNaering) types.push('næringsbebyggelse');
            if (hasIndustri) types.push('industri');
            if (hasTransport) types.push('transportinfrastruktur');
            summary = `Området inneholder ${types.join(', ')} — moderat befolkningstetthet.`;
          }

          landUseData = {
            categories: Object.keys(featureCount),
            groundRiskClassification,
            summary,
            featureCount,
          };
          console.log(`Land use classification: ${groundRiskClassification}`, JSON.stringify(featureCount));
        } else {
          console.error('SSB Arealbruk WFS failed:', wfsResponse.status);
        }
      } catch (e) {
        console.error('SSB Arealbruk fetch error (continuing without land use data):', e);
      }
    }

    // 9c. Fetch SSB population density (befolkning_paa_rutenett) via WFS
    let populationData: {
      maxDensity: number;
      avgDensity: number;
      cellCount: number;
      grcImpact: 'none' | 'moderate' | 'high' | 'very_high';
      grcIncrement: number;
      summary: string;
    } | null = null;

    if (lat && lng) {
      try {
        const allCoords: { lat: number; lng: number }[] = routeCoords && routeCoords.length > 0
          ? routeCoords
          : [{ lat, lng }];

        const degPerMeterLat = 1 / 111320;
        const avgLatPop = allCoords.reduce((s, c) => s + c.lat, 0) / allCoords.length;
        const degPerMeterLng = 1 / (111320 * Math.cos(avgLatPop * Math.PI / 180));
        const bufferM = 1000; // 1km buffer for population grid (matches 1km² cell size)

        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        for (const c of allCoords) {
          if (c.lat < minLat) minLat = c.lat;
          if (c.lat > maxLat) maxLat = c.lat;
          if (c.lng < minLng) minLng = c.lng;
          if (c.lng > maxLng) maxLng = c.lng;
        }
        minLat -= bufferM * degPerMeterLat;
        maxLat += bufferM * degPerMeterLat;
        minLng -= bufferM * degPerMeterLng;
        maxLng += bufferM * degPerMeterLng;

        // SSB befolkning_paa_rutenett WFS 2.0 — 1km² grid cells with population count
        // Note: WFS 2.0 with EPSG:4326 requires lat,lng axis order for BBOX
        const popWfsUrl = `https://kart.ssb.no/api/mapserver/v1/wfs/befolkning_paa_rutenett?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=befolkning_1km_2025&SRSNAME=EPSG:4326&BBOX=${minLat},${minLng},${maxLat},${maxLng},EPSG:4326&COUNT=100`;
        console.log(`Fetching SSB population WFS: bbox=${minLat.toFixed(5)},${minLng.toFixed(5)},${maxLat.toFixed(5)},${maxLng.toFixed(5)}`);

        const popResponse = await fetch(popWfsUrl, { signal: AbortSignal.timeout(8000) });
        if (popResponse.ok) {
          const popText = await popResponse.text();
          console.log(`SSB population WFS response length: ${popText.length} chars`);

          // Parse GML/XML response — extract population values from XML elements
          // Look for common SSB field names in GML elements
          const densities: number[] = [];
          const popPatterns = [
            /<[^>]*:?befolkning[^>]*>(\d+)<\//gi,
            /<[^>]*:?pop_tot[^>]*>(\d+)<\//gi,
            /<[^>]*:?pop[^>]*>(\d+)<\//gi,
            /<[^>]*:?total[^>]*>(\d+)<\//gi,
          ];
          
          for (const pattern of popPatterns) {
            let match;
            while ((match = pattern.exec(popText)) !== null) {
              const val = parseInt(match[1], 10);
              if (!isNaN(val)) densities.push(val);
            }
            if (densities.length > 0) break; // Use first pattern that matches
          }

          console.log(`SSB population WFS: ${densities.length} density values parsed`);

          if (densities.length > 0) {
            const maxDensity = Math.max(...densities);
            const avgDensity = densities.reduce((s, v) => s + v, 0) / densities.length;

            // GRC thresholds per SORA: 500+/km² = populated, 1500+/km² = dense urban
            let grcImpact: 'none' | 'moderate' | 'high' | 'very_high' = 'none';
            let grcIncrement = 0;
            let summary = '';

            if (maxDensity >= 1500) {
              grcImpact = 'very_high';
              grcIncrement = 2;
              summary = `Tett befolket område: ${Math.round(maxDensity)} personer/km² (maks). GRC økes med +2 (iGRC).`;
            } else if (maxDensity >= 500) {
              grcImpact = 'high';
              grcIncrement = 1;
              summary = `Befolket område: ${Math.round(maxDensity)} personer/km² (maks). GRC økes med +1 (iGRC).`;
            } else if (maxDensity >= 100) {
              grcImpact = 'moderate';
              grcIncrement = 0;
              summary = `Spredt bebyggelse: ${Math.round(maxDensity)} personer/km² (maks). Ingen ekstra GRC-økning.`;
            } else {
              grcImpact = 'none';
              grcIncrement = 0;
              summary = `Lav befolkningstetthet: ${Math.round(maxDensity)} personer/km² (maks). Lav bakkerisiko.`;
            }

            populationData = { maxDensity, avgDensity, cellCount: densities.length, grcImpact, grcIncrement, summary };
            console.log(`Population data: max=${maxDensity}, avg=${avgDensity.toFixed(0)}, grcImpact=${grcImpact}, grcIncrement=+${grcIncrement}`);
          } else {
            console.log('SSB population WFS: no density values found in GML response');
            // Log a snippet for debugging
            console.log('GML snippet:', popText.substring(0, 500));
          }
        } else {
          console.error('SSB population WFS failed:', popResponse.status, await popResponse.text().catch(() => ''));
        }
      } catch (e) {
        console.error('SSB population fetch error (continuing without data):', e);
      }
    }

    // 9d. Fetch company-specific SORA config
    let companySoraConfig: any = null;
    let linkedDocumentSummary = '';
    if (companyId) {
      try {
        const { data: soraConfigData } = await supabase
          .from('company_sora_config' as any)
          .select('max_wind_speed_ms, max_wind_gust_ms, max_visibility_km, max_flight_altitude_m, require_backup_battery, require_observer, min_temp_c, max_temp_c, allow_bvlos, allow_night_flight, require_civil_twilight, max_pilot_inactivity_days, max_population_density_per_km2, operative_restrictions, policy_notes, linked_document_ids')
          .eq('company_id', companyId)
          .maybeSingle();

        companySoraConfig = soraConfigData;

        // Fallback to parent company config if none found
        if (!companySoraConfig) {
          const { data: companyRow } = await supabase
            .from('companies')
            .select('parent_company_id')
            .eq('id', companyId)
            .maybeSingle();

          if (companyRow?.parent_company_id) {
            const { data: parentConfig } = await supabase
              .from('company_sora_config' as any)
              .select('max_wind_speed_ms, max_wind_gust_ms, max_visibility_km, max_flight_altitude_m, require_backup_battery, require_observer, min_temp_c, max_temp_c, allow_bvlos, allow_night_flight, require_civil_twilight, max_pilot_inactivity_days, max_population_density_per_km2, operative_restrictions, policy_notes, linked_document_ids')
              .eq('company_id', companyRow.parent_company_id)
              .maybeSingle();
            if (parentConfig) {
              companySoraConfig = parentConfig;
              console.log(`Using parent company SORA config (parent_id=${companyRow.parent_company_id})`);
            }
          }
        }

        if (companySoraConfig?.linked_document_ids?.length > 0) {
          const { data: linkedDocs } = await supabase
            .from('documents')
            .select('tittel, beskrivelse, kategori')
            .in('id', companySoraConfig.linked_document_ids);
          linkedDocumentSummary = linkedDocs
            ?.map((d: any) => `- ${d.tittel} (${d.kategori})${d.beskrivelse ? ': ' + d.beskrivelse : ''}`)
            .join('\n') || '';
        }
        if (companySoraConfig) {
          console.log(`Company SORA config loaded: maxWind=${companySoraConfig.max_wind_speed_ms}m/s, maxAlt=${companySoraConfig.max_flight_altitude_m}m, allowBvlos=${companySoraConfig.allow_bvlos}, allowNight=${companySoraConfig.allow_night_flight}`);
        }
      } catch (e) {
        console.error('Error fetching company SORA config (using defaults):', e);
      }
    }

    // 9e. Calculate civil twilight if required
    let civilTwilightInfo: { dawn: string; dusk: string } | null = null;
    let civilTwilightViolation = false;
    let civilTwilightMissionTime = '';
    let civilTwilightNoTime = false;
    if (companySoraConfig?.require_civil_twilight && lat && lng) {
      try {
        const missionDate = mission.tidspunkt ? new Date(mission.tidspunkt) : new Date();
        const DEG_TO_RAD = Math.PI / 180;
        const doy = Math.floor((missionDate.getTime() - new Date(missionDate.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
        const gamma = ((2 * Math.PI) / 365) * (doy - 1);
        const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.04089 * Math.sin(2 * gamma));
        const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
        const zenith = 96;
        const latRad = lat * DEG_TO_RAD;
        const cosHA = (Math.cos(zenith * DEG_TO_RAD) - Math.sin(latRad) * Math.sin(decl)) / (Math.cos(latRad) * Math.cos(decl));
        if (cosHA >= -1 && cosHA <= 1) {
          const ha = Math.acos(cosHA) * (180 / Math.PI);
          const dawnMin = 720 - 4 * (lng + ha) - eqTime;
          const duskMin = 720 - 4 * (lng - ha) - eqTime;
          const base = new Date(Date.UTC(missionDate.getFullYear(), missionDate.getMonth(), missionDate.getDate()));
          const dawnUTC = new Date(base.getTime() + dawnMin * 60000);
          const duskUTC = new Date(base.getTime() + duskMin * 60000);
          const fmt = (d: Date) => d.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' });
          civilTwilightInfo = { dawn: fmt(dawnUTC), dusk: fmt(duskUTC) };
          console.log(`Civil twilight calculated: dawn=${civilTwilightInfo.dawn}, dusk=${civilTwilightInfo.dusk}`);

          // Deterministic comparison: check if mission time is outside twilight window
          if (mission.tidspunkt) {
            const missionTime = new Date(mission.tidspunkt);
            civilTwilightMissionTime = fmt(missionTime);
            if (missionTime < dawnUTC || missionTime > duskUTC) {
              civilTwilightViolation = true;
              console.log(`Civil twilight VIOLATION: mission at ${civilTwilightMissionTime} is outside ${civilTwilightInfo.dawn}-${civilTwilightInfo.dusk}`);
            } else {
              console.log(`Civil twilight OK: mission at ${civilTwilightMissionTime} is within ${civilTwilightInfo.dawn}-${civilTwilightInfo.dusk}`);
            }
          } else {
            civilTwilightNoTime = true;
            console.log('Civil twilight: no mission time set, will warn');
          }
        } else {
          console.log('Civil twilight: polar conditions, no twilight boundary');
        }
      } catch (e) {
        console.error('Civil twilight calc error:', e);
      }
    }

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
          type: w.z_type,
          name: w.z_name,
          distance: Math.round(w.min_distance),
          inside: w.route_inside,
          severity: w.severity,
        })),
      },
      // GDPR: Anonymize pilot data before sending to AI - use identifiers instead of names
      assignedPilots: assignedPilots.map((p: any, index: number) => ({
        identifier: `Pilot ${index + 1}`,
        role: p.tittel || 'Pilot',
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
      landUse: landUseData,
      populationDensity: populationData,
      companyConfig: companySoraConfig ? {
        hardStops: {
          maxWindSpeedMs: companySoraConfig.max_wind_speed_ms,
          maxWindGustMs: companySoraConfig.max_wind_gust_ms,
          maxVisibilityKm: companySoraConfig.max_visibility_km,
          maxFlightAltitudeM: companySoraConfig.max_flight_altitude_m,
          requireBackupBattery: companySoraConfig.require_backup_battery,
          requireObserver: companySoraConfig.require_observer,
          minTempC: companySoraConfig.min_temp_c ?? -10,
          maxTempC: companySoraConfig.max_temp_c ?? 40,
          allowBvlos: companySoraConfig.allow_bvlos ?? false,
          allowNightFlight: companySoraConfig.allow_night_flight ?? false,
          requireCivilTwilight: companySoraConfig.require_civil_twilight ?? false,
          maxPilotInactivityDays: companySoraConfig.max_pilot_inactivity_days ?? null,
          maxPopulationDensityPerKm2: companySoraConfig.max_population_density_per_km2 ?? null,
        },
        operativeRestrictions: companySoraConfig.operative_restrictions || null,
        policyNotes: companySoraConfig.policy_notes || null,
        linkedDocuments: linkedDocumentSummary || null,
        civilTwilight: civilTwilightInfo ? { ...civilTwilightInfo, violation: civilTwilightViolation, missionTime: civilTwilightMissionTime, noTimeSet: civilTwilightNoTime } : null,
      } : null,
      solarActivity,
    };

    // Professional SMS System Prompt
    const systemPrompt = `Du er en profesjonell Safety Management System (SMS)-assistent for UAS-operasjoner.

Din oppgave er å gjennomføre en strukturert, revisjonsvennlig og beslutningsstøttende risikovurdering for et droneoppdrag i AviSafe, i tråd med EASA-prinsipper, god SMS-praksis og Human Factors.

### SCORE-SKALA (VIKTIG!)
Du skal vurdere 5 kategorier på en skala fra 1 til 10:
- 10 = LAV RISIKO (trygt, anbefalt å fly) - GRØNN
- 7-9 = MODERAT RISIKO (akseptabelt med forholdsregler) - GRØNN/GUL
- 5-6 = FORHØYET RISIKO (krever tiltak) - GUL
- 1-4 = HØY RISIKO (farlig, ikke anbefalt) - RØD

HØY SCORE = BRA (lav risiko, trygt)
LAV SCORE = DÅRLIG (høy risiko, farlig)

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
1. VÆR: Vindstyrke (middelvind) > ${companySoraConfig?.max_wind_speed_ms ?? 10} m/s ELLER vindkast > ${companySoraConfig?.max_wind_gust_ms ?? 15} m/s ELLER sikt < ${companySoraConfig?.max_visibility_km ?? 1} km ELLER kraftig nedbør
2. VÆR - TEMPERATUR: Temperatur < ${companySoraConfig?.min_temp_c ?? -10}°C ELLER > ${companySoraConfig?.max_temp_c ?? 40}°C (kritisk for LiPo-batterier)
3. UTSTYR: Drone eller kritisk utstyr har status "Rød" (MERK: "Gul" status utløser IKKE hard stop, men skal gi lavere score og anbefaling om forsiktighet)
4. PILOT: Ingen gyldige kompetanser eller alle påkrevde sertifikater er utløpt
${companySoraConfig?.max_pilot_inactivity_days ? `5. PILOT - INAKTIVITET: Pilot har ikke flydd på mer enn ${companySoraConfig.max_pilot_inactivity_days} dager → HARD STOP for å sikre recency.` : ''}
${companySoraConfig?.allow_bvlos === false ? `${companySoraConfig?.max_pilot_inactivity_days ? '6' : '5'}. BVLOS FORBUDT: Selskapet tillater IKKE BVLOS-flyging — oppdrag utenfor visuell rekkevidde er HARD STOP.` : ''}
${companySoraConfig?.allow_night_flight === false ? `NATTFLYGING FORBUDT: Selskapet tillater IKKE nattflyging — oppdrag i mørket er HARD STOP.` : ''}
${companySoraConfig?.max_population_density_per_km2 ? `BEFOLKNINGSTETTHET: Selskapet tillater IKKE flyging over områder med mer enn ${companySoraConfig.max_population_density_per_km2} pers/km² — HARD STOP hvis populationDensity.maxDensity overstiger denne verdien.` : ''}
${companySoraConfig?.require_backup_battery ? 'RESERVEBATTERI: Selskapet KREVER reservebatteri — mangler dette er det HARD STOP.' : ''}
${companySoraConfig?.require_observer ? 'OBSERVATØR: Selskapet KREVER dedikert observatør — mangler dette er det HARD STOP.' : ''}
${companySoraConfig?.require_civil_twilight && civilTwilightInfo ? (civilTwilightViolation ? `SIVIL SKUMRING — HARD STOP: Oppdraget er planlagt kl. ${civilTwilightMissionTime} som er UTENFOR sivil skumring (dawn: ${civilTwilightInfo.dawn}, dusk: ${civilTwilightInfo.dusk}). Dette er et BRUDD og SKAL gi recommendation='no-go' og hard_stop_triggered=true. Forklar i rapporten at tidspunktet bryter selskapets krav om flyging innenfor sivil skumring.` : civilTwilightNoTime ? `SIVIL SKUMRING — ADVARSEL: Selskapet krever flyging innenfor sivil skumring (dawn: ${civilTwilightInfo.dawn}, dusk: ${civilTwilightInfo.dusk}), men oppdraget har ingen planlagt tid. Gi advarsel i rapporten om at tidspunkt MÅ bekreftes innenfor skumringstidene før flyging.` : `SIVIL SKUMRING: OK — Oppdraget kl. ${civilTwilightMissionTime} er innenfor sivil skumring (dawn: ${civilTwilightInfo.dawn}, dusk: ${civilTwilightInfo.dusk}). Bekreft kort i rapporten at skumringstid er overholdt.`) : ''}
VIKTIG: Høy piloterfaring kan IKKE kompensere for tekniske eller meteorologiske overskridelser. HARD STOP skal utløses uavhengig av andre scores.

${companySoraConfig ? `### SELSKAPSINNSTILLINGER (OBLIGATORISK — OVERSTYRER SYSTEM-DEFAULTS)
Feltet "companyConfig" inneholder selskapets egne krav som ALLTID gjelder:

HARDSTOP-GRENSER (absolutte, ikke forhandlingsbare):
- Max vindstyrke: ${companySoraConfig.max_wind_speed_ms} m/s
- Max vindkast: ${companySoraConfig.max_wind_gust_ms} m/s
- Min sikt: ${companySoraConfig.max_visibility_km} km
- Max flyhøyde: ${companySoraConfig.max_flight_altitude_m} m AGL
- Temperaturvindu: ${companySoraConfig.min_temp_c ?? -10}°C til ${companySoraConfig.max_temp_c ?? 40}°C
- BVLOS tillatt: ${companySoraConfig.allow_bvlos ? 'Ja' : 'NEI — HARD STOP ved BVLOS'}
- Nattflyging tillatt: ${companySoraConfig.allow_night_flight ? 'Ja' : 'NEI — HARD STOP ved nattoppdrag'}
${companySoraConfig.max_pilot_inactivity_days ? `- Maks pilotinaktivitet: ${companySoraConfig.max_pilot_inactivity_days} dager` : ''}
${companySoraConfig.max_population_density_per_km2 ? `- Maks befolkningstetthet: ${companySoraConfig.max_population_density_per_km2} pers/km²` : ''}
- Krev reservebatteri: ${companySoraConfig.require_backup_battery ? 'JA — OBLIGATORISK' : 'Nei'}
- Krev observatør: ${companySoraConfig.require_observer ? 'JA — OBLIGATORISK' : 'Nei'}
${companySoraConfig.require_civil_twilight ? `- Krev sivil skumring: JA — HARD STOP utenfor dawn/dusk${civilTwilightInfo ? ` (dawn: ${civilTwilightInfo.dawn}, dusk: ${civilTwilightInfo.dusk})` : ''}` : ''}

Hvis flyhøyde i oppdraget overstiger ${companySoraConfig.max_flight_altitude_m} m AGL, SKAL recommendation="no-go" og hard_stop_triggered=true returneres.

${companySoraConfig.operative_restrictions ? `OPERATIVE BEGRENSNINGER FRA SELSKAPET:\n${companySoraConfig.operative_restrictions}` : ''}

${companySoraConfig.policy_notes ? `SELSKAPETS OPERASJONSMANUAL — NØKKELPUNKTER (les og bruk aktivt):\n${companySoraConfig.policy_notes}\n\nVurder om oppdraget er i tråd med disse reglene. Nevn avvik eksplisitt i concerns.` : ''}

${linkedDocumentSummary ? `TILKNYTTEDE POLICYDOKUMENTER (referanse for AI):\n${linkedDocumentSummary}` : ''}` : ''}

### FORUTSETNINGER
Anta alltid at piloten vil:
- Utføre pre-flight sjekk før avgang
- Programmere RTH (Return to Home)
- Gjennomføre visuell inspeksjon av dronen
Disse skal kommenteres som forutsetninger i prerequisites.

${skipWeather ? '### VÆR-MERKNAD\nBruker har valgt å hoppe over værvurdering. Sett weather.score til 7, weather.go_decision til "BETINGET", og noter at vær må vurderes separat før flyging.' : ''}

### VLOS / BVLOS-VURDERING
Pilotens input angir om operasjonen er VLOS eller BVLOS (isVlos-feltet i pilotInputs).

Hvis BVLOS (isVlos = false):
- Krev SORA-analyse (mission.sora). Hvis ingen SORA finnes, reduser overall_score med 3 og legg til NO-GO-anbefaling.
- Krev spesifikke BVLOS-kompetanser (STS-02, BVLOS-sertifisering e.l.). Reduser pilot_experience score med 2 hvis mangler.
- Vurder behov for C2-link (command & control), DAA (detect and avoid), og redundante systemer.
- Reduser mission_complexity score med 1-2 pga. økt operasjonell kompleksitet.
- Legg til spesifikke BVLOS-anbefalinger i recommendations (kommunikasjonsplan, nødstopp-prosedyrer, lost-link-prosedyre).

Hvis VLOS (isVlos = true):
- Standard vurdering uten ekstra BVLOS-krav.
- Observer-behov vurderes basert på observerCount.

### LUFTRISIKO — AEC, ARC OG TMPR (EASA SORA)
Du SKAL alltid utføre en strukturert luftrisikoanalyse og returnere den i feltet "air_risk_analysis".

#### Steg 1: Bestem AEC (Air Encounter Category)
Bruk følgende tabell basert på luftromsklasse, høyde og lokasjon:

| AEC | Beskrivelse | ARC |
|-----|------------|-----|
| AEC 1 | Luftrom klasse A (IFR only) | ARC-d |
| AEC 2 | Luftrom klasse B (alle separert) | ARC-d |
| AEC 3 | Luftrom klasse C, over 500 ft | ARC-d |
| AEC 4 | Luftrom klasse C, under 500 ft | ARC-c |
| AEC 5 | Luftrom klasse D, over 500 ft | ARC-d |
| AEC 6 | Luftrom klasse D, under 500 ft | ARC-c |
| AEC 7 | Luftrom klasse E/F, over 500 ft | ARC-c |
| AEC 8 | Luftrom klasse E/F, under 500 ft | ARC-b |
| AEC 9 | Luftrom klasse G, over 500 ft, Mode-S/TMZ | ARC-c |
| AEC 10 | Luftrom klasse G, over 500 ft, uten Mode-S | ARC-c |
| AEC 11 | Luftrom klasse G, under 500 ft, urbant | ARC-b |
| AEC 12 | Luftrom klasse G, under 500 ft, landlig | ARC-b |

Bruk kontekstdata:
- airspace.warnings: Sjekk om CTR/TIZ (kontrollert luftrom) er i nærheten → klasse D typisk
- pilotInputs.flightHeight: Over/under 500 ft (~150m)
- landUse/populationDensity: Urbant vs landlig
- Hvis ingen spesifikke luftromsadvarsler: Anta klasse G (ukontrollert)

#### Steg 2: Bestem initiell ARC (iARC)
Sett iARC direkte fra AEC-tabellen ovenfor.

#### Steg 3: Vurder strategiske mitigeringer (kan redusere ARC)
Strategiske mitigeringer kan redusere ARC med opptil 2 nivåer totalt:

**Operasjonelle restriksjoner (maks 2 nivåer reduksjon):**
- Avgrensning av operasjonsområdet til område med lite bemannet trafikk
- Tidspunkt valgt med lav trafikkforventning (tidlig morgen, sein kveld, vinter)
- Kort eksponering i luftrommet (kort flygetid)

**Regler og luftromsstruktur (maks 1 ekstra nivå, KUN under 500 ft):**
- NOTAM publisert 12+ timer før (obligatorisk for BVLOS uten observatør)
- Elektronisk synlighet (ADS-B/ADS-L sender, SafeSky)
- Klarering fra kontrolltårn (Ninox drone)
- Koordinering med lufttrafikktjeneste

**Luftromsanalyse:**
- For å redusere til ARC-c: Vis at operasjonsvolumet har trafikk som ARC-c luftrom
- For å redusere til ARC-b: Vis at det tilsvarer luftrom under 500 ft i landlige områder
- For å redusere til ARC-a: Vis at det tilsvarer segregert luftrom (fareområde, svært lav høyde nær hindre)

Atypisk luftrom (ARC-a) er definert som luftrom der risiko for kollisjon mellom drone og bemannet luftfart er akseptabelt lav uten taktiske mitigeringer. Eksempler: reservert luftrom, operasjoner i svært lav høyde nær objekter/bakken (under 30m over bakken, eller innenfor 30m fra hindre under 20m, eller innenfor 15m fra hindre over 20m).

#### Steg 4: Bestem residual ARC
Sett residual ARC etter å ha vurdert alle relevante mitigeringer.

#### Steg 5: Bestem TMPR-nivå og krav
Basert på residual ARC og flygemodus:

| Residual ARC | TMPR-nivå | Robusthetsnivå |
|---|---|---|
| ARC-d | High | Høy |
| ARC-c | Medium | Middels |
| ARC-b | Low | Lav |
| ARC-a | None | Ingen krav |

VLOS-operasjon eller BVLOS med luftromsobservatør anses som akseptabel taktisk mitigering for alle ARC-klasser.

For BVLOS uten observatør, angi spesifikke TMPR-krav for de 5 funksjonene:
- **Detect**: Hvordan detektere bemannet trafikk (ADS-B mottaker, SafeSky, Flightradar24, FLARM/ADS-L)
- **Decide**: Dokumentert unnvikelsesprosedyre
- **Command**: C2-link latenskrav
- **Execute**: Dronens evne til å utføre unnvikelsesmanøver
- **Feedback Loop**: Oppdateringsrate og latens for posisjonsinformasjon

#### Steg 6: Deteksjonsanbefalinger
Anbefal konkrete deteksjonssystemer basert på operasjonstype og luftrom:
- Innebygd ADS-B mottaker (1090 MHz)
- ADS-L mottaker (868 MHz, for seilfly/FLARM)
- SafeSky (app-basert posisjonsdeling)
- Flightradar24 (sjekk dekningsgrad for operasjonsområdet)
- Luftromsobservatør (maks 1-3 km fra observatør)
- Flyradio (lytte på relevant frekvens nær landingsplasser)

Hvis operasjonen er VLOS, sett vlos_exemption=true og forenkle TMPR-kravene.

### SOLSTORM / GEOMAGNETISK AKTIVITET
Feltet "solarActivity" inneholder Kp-indeks fra NOAA Space Weather Prediction Center.
${solarActivity ? `Kp-indeks for oppdragsdato: ${solarActivity.kpIndex} (${solarActivity.noaaScale}, ${solarActivity.level}).` : 'Solstormdata er ikke tilgjengelig.'}
- Hvis Kp < 5 (G0): Skriv KUN én kort setning i equipment-kategoriens "factors", f.eks. "Geomagnetisk aktivitet vurdert — Kp ${solarActivity?.kpIndex ?? '?'}, ingen forstyrrelse forventet." IKKE utdyp mer enn dette.
- Hvis Kp 5–6 (G1–G2): Advarsel i equipment "concerns" om mulig GPS/GNSS-degradering. Reduser equipment score med 1 poeng.
- Hvis Kp 7+ (G3+): Sterk advarsel. Reduser equipment score med 2–3 poeng. Vurder caution eller no-go avhengig av total risiko.

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
      "complexity_factors": "<lettlest beskrivelse av arealbruk, terreng, befolkningstetthet og operasjonelle faktorer på naturlig norsk — IKKE bruk tekniske variabelnavn>",
      "actual_conditions": "<beskrivelse av faktiske forhold i området på naturlig norsk, inkludert befolkningstetthet og arealbruk>",
      "factors": ["<positive faktorer>"],
      "concerns": ["<bekymringer>"]
    }
  },
  "air_risk_analysis": {
    "aec": "<AEC 1-12>",
    "aec_reasoning": "<kort forklaring av hvorfor denne AEC ble valgt basert på luftrom, høyde og lokasjon>",
    "initial_arc": "<ARC-a|ARC-b|ARC-c|ARC-d>",
    "strategic_mitigations_applied": ["<liste over relevante strategiske mitigeringer som er vurdert/anbefalt>"],
    "strategic_mitigations_not_applied": ["<mitigeringer som IKKE er tilgjengelig eller relevant>"],
    "residual_arc": "<ARC-a|ARC-b|ARC-c|ARC-d>",
    "tmpr_level": "<High|Medium|Low|None>",
    "tmpr_requirements": {
      "detect": "<krav til deteksjon av bemannet trafikk, eller 'Ikke påkrevd' for ARC-a/VLOS>",
      "decide": "<krav til beslutningsprosedyre>",
      "command": "<krav til C2-link>",
      "execute": "<krav til unnvikelsesevne>",
      "feedback_loop": "<krav til oppdateringsrate>"
    },
    "detection_recommendations": ["<konkrete anbefalte deteksjonssystemer>"],
    "vlos_exemption": <true hvis VLOS — forenklet TMPR>,
    "traffic_types_to_consider": ["<relevante trafikktyper å vurdere i området, f.eks. ambulansehelikopter, småfly, paraglidere>"],
    "arc_reduction_reasoning": "<kort forklaring av hvorfor/hvordan ARC ble redusert, eller 'Ingen reduksjon' hvis iARC = residual ARC>"
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

    // Normalize scores to ensure they are on 1-10 scale (fix if AI returns percentages like 0.3 instead of 3)
    const normalizeScore = (score: number | undefined | null): number | null => {
      if (score === undefined || score === null) return null;
      // If score is less than 1, it's likely a decimal (0.3 = 30%) - convert to 1-10 scale
      if (score > 0 && score < 1) {
        return Math.round(score * 10);
      }
      // Clamp to 1-10 range
      return Math.max(1, Math.min(10, Math.round(score)));
    };

    // Normalize all category scores
    if (aiAnalysis.categories) {
      for (const key of Object.keys(aiAnalysis.categories)) {
        if (aiAnalysis.categories[key]?.score !== undefined) {
          aiAnalysis.categories[key].score = normalizeScore(aiAnalysis.categories[key].score) ?? aiAnalysis.categories[key].score;
        }
      }
    }
    if (aiAnalysis.overall_score !== undefined) {
      aiAnalysis.overall_score = normalizeScore(aiAnalysis.overall_score) ?? aiAnalysis.overall_score;
    }

    console.log('AI analysis complete:', aiAnalysis.recommendation, 'HARD STOP:', aiAnalysis.hard_stop_triggered, 'Overall score:', aiAnalysis.overall_score);
    console.log('Air risk analysis present:', !!aiAnalysis.air_risk_analysis, aiAnalysis.air_risk_analysis ? JSON.stringify(aiAnalysis.air_risk_analysis).substring(0, 200) : 'MISSING');

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
        pilot_comments: pilotComments || {},
        weather_data: weatherData,
        airspace_warnings: airspaceWarnings,
      })
      .select()
      .single();

    if (saveError) {
      console.error('Save error:', saveError);
      // Still return the analysis even if save fails
    }

    // 11. SORA-based auto-approval
    let autoApproved = false;
    let approvalStatus: 'approved' | 'not_approved' | null = null;
    let approvalReason: string | null = null;
    let approvalThreshold: number | null = null;
    try {
      const { data: soraApprovalConfig } = await supabase
        .from('company_sora_config')
        .select('sora_based_approval, sora_approval_threshold, sora_hardstop_requires_approval')
        .eq('company_id', companyId)
        .maybeSingle();

      if (soraApprovalConfig?.sora_based_approval && missionId) {
        const overallScore = aiAnalysis.overall_score ?? 0;
        const hardStopTriggered = aiAnalysis.hard_stop_triggered === true;
        const threshold = Number(soraApprovalConfig.sora_approval_threshold) || 7.0;
        const hardstopRequiresApproval = soraApprovalConfig.sora_hardstop_requires_approval !== false;
        approvalThreshold = threshold;

        if (hardStopTriggered && hardstopRequiresApproval) {
          await supabase.from('missions').update({ approval_status: 'not_approved' }).eq('id', missionId);
          approvalStatus = 'not_approved';
          approvalReason = `Hardstop utløst — krever manuell godkjenning`;
          console.log('SORA auto-approval: DENIED (hardstop triggered)');
        } else if (overallScore >= threshold && !hardStopTriggered) {
          await supabase.from('missions').update({ approval_status: 'approved' }).eq('id', missionId);
          autoApproved = true;
          approvalStatus = 'approved';
          approvalReason = `AI-score ${overallScore.toFixed(1)} oppfyller terskel ${threshold.toFixed(1)}`;
          console.log('SORA auto-approval: APPROVED (score', overallScore, '>=', threshold, ')');
        } else {
          await supabase.from('missions').update({ approval_status: 'not_approved' }).eq('id', missionId);
          approvalStatus = 'not_approved';
          approvalReason = `AI-score ${overallScore.toFixed(1)} er under terskel ${threshold.toFixed(1)} — krever manuell godkjenning`;
          console.log('SORA auto-approval: DENIED (score', overallScore, '<', threshold, ')');
        }
      }
    } catch (approvalErr) {
      console.error('SORA auto-approval error (non-blocking):', approvalErr);
    }

    return new Response(JSON.stringify({
      success: true,
      assessment: savedAssessment || {
        ...aiAnalysis,
        weather_data: weatherData,
        airspace_warnings: airspaceWarnings,
      },
      aiAnalysis,
      autoApproved,
      approvalStatus,
      approvalReason,
      approvalThreshold,
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
