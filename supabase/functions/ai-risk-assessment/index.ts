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

        // SSB befolkning_paa_rutenett WFS — 1km² grid cells with population count
        const popWfsUrl = `https://kart.ssb.no/arcgis/services/ekstern/befolkning_paa_rutenett/MapServer/WFSServer?service=WFS&version=2.0.0&request=GetFeature&typeName=befolkning_paa_rutenett_1000m&srsName=EPSG:4326&bbox=${minLng},${minLat},${maxLng},${maxLat},EPSG:4326&outputFormat=application/json&count=100`;
        console.log(`Fetching SSB population WFS: bbox=${minLng.toFixed(5)},${minLat.toFixed(5)},${maxLng.toFixed(5)},${maxLat.toFixed(5)}`);

        const popResponse = await fetch(popWfsUrl, { signal: AbortSignal.timeout(8000) });
        if (popResponse.ok) {
          const popJson = await popResponse.json();
          const features = popJson.features || [];
          console.log(`SSB population WFS: ${features.length} cells returned`);

          const densities: number[] = features
            .map((f: any) => {
              // Try common field names for population count
              const props = f.properties || {};
              return props.befolkning ?? props.pop ?? props.total ?? props.count ?? props.value ?? null;
            })
            .filter((v: any) => v !== null && v !== undefined && !isNaN(Number(v)))
            .map(Number);

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
            console.log('SSB population WFS: no density values parsed from features');
            // Try alternative GeoServer endpoint
            const altUrl = `https://kart.ssb.no/api/mapserver/v1/wfs/befolkning_paa_rutenett?service=WFS&version=2.0.0&request=GetFeature&typeName=befolkning_1km_2025&srsName=EPSG:4326&bbox=${minLng},${minLat},${maxLng},${maxLat},EPSG:4326&outputFormat=application/json&count=50`;
            const altResponse = await fetch(altUrl, { signal: AbortSignal.timeout(6000) });
            if (altResponse.ok) {
              const altJson = await altResponse.json();
              const altFeatures = altJson.features || [];
              const altDensities: number[] = altFeatures
                .map((f: any) => {
                  const props = f.properties || {};
                  return props.befolkning ?? props.pop ?? props.total ?? props.count ?? null;
                })
                .filter((v: any) => v !== null && !isNaN(Number(v)))
                .map(Number);
              if (altDensities.length > 0) {
                const maxDensity = Math.max(...altDensities);
                const avgDensity = altDensities.reduce((s, v) => s + v, 0) / altDensities.length;
                let grcImpact: 'none' | 'moderate' | 'high' | 'very_high' = 'none';
                let grcIncrement = 0;
                let summary = '';
                if (maxDensity >= 1500) { grcImpact = 'very_high'; grcIncrement = 2; summary = `Tett befolket område: ${Math.round(maxDensity)} personer/km² (maks). GRC økes med +2 (iGRC).`; }
                else if (maxDensity >= 500) { grcImpact = 'high'; grcIncrement = 1; summary = `Befolket område: ${Math.round(maxDensity)} personer/km² (maks). GRC økes med +1 (iGRC).`; }
                else if (maxDensity >= 100) { grcImpact = 'moderate'; grcIncrement = 0; summary = `Spredt bebyggelse: ${Math.round(maxDensity)} personer/km² (maks).`; }
                else { grcImpact = 'none'; grcIncrement = 0; summary = `Lav befolkningstetthet: ${Math.round(maxDensity)} personer/km².`; }
                populationData = { maxDensity, avgDensity, cellCount: altDensities.length, grcImpact, grcIncrement, summary };
                console.log(`Population (alt endpoint): max=${maxDensity}, grcImpact=${grcImpact}`);
              }
            }
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
          .select('max_wind_speed_ms, max_wind_gust_ms, max_visibility_km, max_flight_altitude_m, require_backup_battery, require_observer, min_temp_c, max_temp_c, allow_bvlos, allow_night_flight, max_pilot_inactivity_days, max_population_density_per_km2, operative_restrictions, policy_notes, linked_document_ids')
          .eq('company_id', companyId)
          .maybeSingle();

        companySoraConfig = soraConfigData;

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
          maxPilotInactivityDays: companySoraConfig.max_pilot_inactivity_days ?? null,
          maxPopulationDensityPerKm2: companySoraConfig.max_population_density_per_km2 ?? null,
        },
        operativeRestrictions: companySoraConfig.operative_restrictions || null,
        policyNotes: companySoraConfig.policy_notes || null,
        linkedDocuments: linkedDocumentSummary || null,
      } : null,
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

### AREALBRUK OG GROUND RISK (SSB-data)
Hvis feltet "landUse" finnes i kontekstdataene, bruk dette som PRIMÆRKILDE for ground risk-vurdering i mission_complexity-kategorien:
- groundRiskClassification "high": Boligområder eller offentlige institusjoner i operasjonsområdet. Reduser mission_complexity score med 2-3 poeng. List kategoriene i complexity_factors og legg til spesifikke concerns.
- groundRiskClassification "moderate": Næring, industri eller transport i området. Reduser mission_complexity score med 1-2 poeng.
- groundRiskClassification "low": Ubebodd/fritidsområde — ingen ekstra reduksjon.
- Hvis landUse er null (data utilgjengelig), fall tilbake på pilotens manuelle input om "proximityToPeople".
Arealbrukskategoriene og featureCount gir detaljert informasjon om hva som finnes i området — bruk dette til å gi konkrete anbefalinger i recommendations.

### BEFOLKNINGSTETTHET OG SORA GRC (SSB befolkningsgitter-data)
Feltet "populationDensity" inneholder faktiske personantall per km² hentet fra SSBs befolkningsgitter. Dette er OBLIGATORISK input for SORA Ground Risk Class (GRC):

- grcImpact "very_high" (1500+ pers/km²): Tett bybebyggelse. Legg til grcIncrement (+2) på baseline iGRC. Angi environment som "Tettbygd". Reduser mission_complexity score med 3 poeng. Krev spesifikke tiltak: sperringer, beredskapsplan, koordinering med grunneier/politi.
- grcImpact "high" (500–1499 pers/km²): Befolket område. Legg til grcIncrement (+1) på baseline iGRC. Reduser mission_complexity score med 2 poeng. Krev tiltak: buffersoner, kommunikasjon med berørte.
- grcImpact "moderate" (100–499 pers/km²): Spredt bebyggelse. Ingen GRC-økning, men noter i concerns. Reduser mission_complexity score med 1 poeng.
- grcImpact "none" (<100 pers/km²): Lav tetthet — ingen ekstra GRC-tillegg.
- Hvis populationDensity er null (data utilgjengelig): bruk landUse og pilotInput som fallback.

VIKTIG: Oppgi alltid befolkningstettheten (maxDensity) i "actual_conditions" for mission_complexity, og nevn GRC-påvirkningen eksplisitt i complexity_factors.

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
