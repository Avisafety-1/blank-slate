import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache med 5 minutters levetid
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutter

// Trunkerer koordinater til 4 desimaler
function truncateCoord(coord: number): number {
  return Math.round(coord * 10000) / 10000;
}

// Genererer cache-nøkkel
function getCacheKey(lat: number, lon: number): string {
  return `${truncateCoord(lat)},${truncateCoord(lon)}`;
}

// Evaluerer drone-advarsler basert på værforhold for ett tidspunkt
// Velg beste tilgjengelige nedbør-/symbolperiode for et timeseries-punkt.
// Langt frem i tid finnes bare next_6_hours / next_12_hours.
function pickPeriod(entry: any): { data: any; hours: number } | null {
  const d = entry?.data;
  if (!d) return null;
  if (d.next_1_hours) return { data: d.next_1_hours, hours: 1 };
  if (d.next_6_hours) return { data: d.next_6_hours, hours: 6 };
  if (d.next_12_hours) return { data: d.next_12_hours, hours: 12 };
  return null;
}

function precipInfo(period: { data: any; hours: number } | null) {
  const det = period?.data?.details || {};
  const amount = det.precipitation_amount ?? 0;
  const min = det.precipitation_amount_min ?? null;
  const max = det.precipitation_amount_max ?? null;
  return {
    amount,
    min,
    max,
    // Bruk maks når MET oppgir intervall (0–3 mm) for advarselsvurdering
    worst: Math.max(amount ?? 0, max ?? 0),
    hours: period?.hours ?? 1,
    symbol: period?.data?.summary?.symbol_code || 'unknown',
  };
}

function evaluateWeatherConditions(current: any, next1h: any, periodHours = 1) {
  const warnings: any[] = [];

  if (!current) {
    return { warnings, recommendation: 'unknown' as const };
  }

  const windSpeed = current.wind_speed || 0;
  const windGust = current.wind_speed_of_gust || 0;
  const precipDetails = next1h?.details || {};
  // Bruk maks-verdien når MET oppgir intervall, slik at «0–3 mm» ikke vises som 0
  const rawPrecip = Math.max(
    precipDetails.precipitation_amount ?? 0,
    precipDetails.precipitation_amount_max ?? 0,
  );
  // Normaliser til mm/t når perioden er lengre enn 1 time
  const precipitation = periodHours > 1 ? rawPrecip / periodHours : rawPrecip;
  const temperature = current.air_temperature || 0;
  const symbolCode = next1h?.summary?.symbol_code || '';
  const dewPoint = current.dew_point_temperature;



  // Vind advarsler
  if (windSpeed > 10) {
    warnings.push({
      level: 'warning',
      type: 'wind',
      message: `Sterk vind ${windSpeed.toFixed(1)} m/s - anbefales ikke å fly`,
      value: windSpeed,
      unit: 'm/s'
    });
  } else if (windSpeed > 7) {
    warnings.push({
      level: 'caution',
      type: 'wind',
      message: `Vindstyrke ${windSpeed.toFixed(1)} m/s - utvis forsiktighet`,
      value: windSpeed,
      unit: 'm/s'
    });
  } else if (windSpeed > 5) {
    warnings.push({
      level: 'note',
      type: 'wind',
      message: `Moderat vind ${windSpeed.toFixed(1)} m/s - egnet for erfarne piloter`,
      value: windSpeed,
      unit: 'm/s'
    });
  }

  // Vindkast
  if (windGust > 15) {
    warnings.push({
      level: 'warning',
      type: 'gust',
      message: `Sterke vindkast ${windGust.toFixed(1)} m/s - anbefales ikke å fly`,
      value: windGust,
      unit: 'm/s'
    });
  } else if (windGust > 10) {
    warnings.push({
      level: 'caution',
      type: 'gust',
      message: `Vindkast ${windGust.toFixed(1)} m/s - vær oppmerksom`,
      value: windGust,
      unit: 'm/s'
    });
  }

  // Nedbør
  if (precipitation > 2) {
    warnings.push({
      level: 'warning',
      type: 'precipitation',
      message: `Kraftig nedbør ${precipitation.toFixed(1)} mm/t - ikke fly`,
      value: precipitation,
      unit: 'mm/t'
    });
  } else if (precipitation > 0.5) {
    warnings.push({
      level: 'caution',
      type: 'precipitation',
      message: `Nedbør ${precipitation.toFixed(1)} mm/t - vurder forhold`,
      value: precipitation,
      unit: 'mm/t'
    });
  } else if (precipitation > 0) {
    warnings.push({
      level: 'note',
      type: 'precipitation',
      message: `Lett nedbør ${precipitation.toFixed(1)} mm/t`,
      value: precipitation,
      unit: 'mm/t'
    });
  }

  // Temperatur
  if (temperature < -10 || temperature > 40) {
    warnings.push({
      level: 'warning',
      type: 'temperature',
      message: `Ekstrem temperatur ${temperature.toFixed(1)}°C - batterier påvirkes`,
      value: temperature,
      unit: '°C'
    });
  } else if (temperature < 0) {
    warnings.push({
      level: 'caution',
      type: 'temperature',
      message: `Lav temperatur ${temperature.toFixed(1)}°C - vær oppmerksom på batteritid`,
      value: temperature,
      unit: '°C'
    });
  }

  // Duggpunkt / kondens
  if (dewPoint != null && temperature != null) {
    const dewPointDiff = temperature - dewPoint;
    if (dewPointDiff < 1) {
      warnings.push({
        level: 'warning',
        type: 'dew_point',
        message: `Svært høy risiko for kondens — duggpunktdifferanse ${dewPointDiff.toFixed(1)}°C`,
        value: dewPointDiff,
        unit: '°C'
      });
    } else if (dewPointDiff < 3) {
      warnings.push({
        level: 'caution',
        type: 'dew_point',
        message: `Fare for kondens — duggpunktdifferanse ${dewPointDiff.toFixed(1)}°C`,
        value: dewPointDiff,
        unit: '°C'
      });
    } else if (dewPointDiff < 5) {
      warnings.push({
        level: 'note',
        type: 'dew_point',
        message: `Nær duggpunktet (${dewPointDiff.toFixed(1)}°C differanse) — vær oppmerksom på fuktighet`,
        value: dewPointDiff,
        unit: '°C'
      });
    }
  }

  // Tåke/uvær
  if (symbolCode.includes('fog')) {
    warnings.push({
      level: 'warning',
      type: 'visibility',
      message: 'Tåke - redusert sikt',
      value: 0,
      unit: ''
    });
  }

  // Beregn samlet anbefaling
  let recommendation: 'ok' | 'caution' | 'warning' = 'ok';
  if (warnings.some(w => w.level === 'warning')) {
    recommendation = 'warning';
  } else if (warnings.some(w => w.level === 'caution')) {
    recommendation = 'caution';
  }

  return { warnings, recommendation };
}

// Wrapper for bakoverkompatibilitet
function evaluateWeatherForDrone(data: any, index = 0) {
  const entry = data.properties?.timeseries?.[index];
  const current = entry?.data?.instant?.details;
  const period = pickPeriod(entry);
  return evaluateWeatherConditions(current, period?.data, period?.hours ?? 1);
}


// Finn indeksen i timeseries nærmest ønsket tidspunkt
function findClosestIndex(timeseries: any[], targetTime?: string | null): number {
  if (!targetTime) return 0;
  const target = new Date(targetTime).getTime();
  if (!Number.isFinite(target)) return 0;

  let bestIndex = 0;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < timeseries.length; i++) {
    const t = new Date(timeseries[i]?.time).getTime();
    if (!Number.isFinite(t)) continue;
    const diff = Math.abs(t - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }
  return bestIndex;
}

// Generer timeprognose (24 punkter) rundt et startpunkt
function generateHourlyForecast(timeseries: any[], startIndex = 0) {
  const hourlyForecast: any[] = [];

  const start = Math.max(0, Math.min(startIndex, Math.max(0, timeseries.length - 1)));
  const hoursToForecast = Math.min(24, Math.max(0, timeseries.length - start));

  for (let k = 0; k < hoursToForecast; k++) {
    const i = start + k;
    const entry = timeseries[i];
    if (!entry) continue;
    
    const current = entry.data?.instant?.details;
    const next1h = entry.data?.next_1_hours;
    
    const { recommendation } = evaluateWeatherConditions(current, next1h);
    
    hourlyForecast.push({
      time: entry.time,
      temperature: current?.air_temperature || null,
      wind_speed: current?.wind_speed || null,
      wind_gust: current?.wind_speed_of_gust || null,
      dew_point: current?.dew_point_temperature ?? null,
      precipitation: next1h?.details?.precipitation_amount || 0,
      symbol: next1h?.summary?.symbol_code || 'unknown',
      recommendation,
    });
  }
  
  return hourlyForecast;
}

// Finn beste flyvindu (lengste sammenhengende periode med "ok")
function findBestFlightWindow(hourlyForecast: any[]) {
  let bestStart = -1;
  let bestLength = 0;
  let currentStart = -1;
  let currentLength = 0;

  for (let i = 0; i < hourlyForecast.length; i++) {
    if (hourlyForecast[i].recommendation === 'ok') {
      if (currentStart === -1) {
        currentStart = i;
        currentLength = 1;
      } else {
        currentLength++;
      }
      
      if (currentLength > bestLength) {
        bestLength = currentLength;
        bestStart = currentStart;
      }
    } else {
      currentStart = -1;
      currentLength = 0;
    }
  }

  if (bestStart === -1 || bestLength === 0) {
    return null;
  }

  return {
    start_time: hourlyForecast[bestStart].time,
    end_time: hourlyForecast[bestStart + bestLength - 1].time,
    duration_hours: bestLength,
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lat, lon, targetTime } = await req.json();

    if (!lat || !lon) {
      return new Response(
        JSON.stringify({ error: 'Missing lat or lon parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normaliser måltidspunkt til hel time (for cache-nøkkel)
    let targetIso: string | null = null;
    if (targetTime) {
      const parsed = new Date(targetTime);
      if (Number.isFinite(parsed.getTime())) {
        parsed.setUTCMinutes(0, 0, 0);
        targetIso = parsed.toISOString();
      }
    }

    // Trunkerer koordinater
    const truncatedLat = truncateCoord(lat);
    const truncatedLon = truncateCoord(lon);
    const cacheKey = `${getCacheKey(truncatedLat, truncatedLon)}|${targetIso ?? 'now'}`;

    // Sjekk cache
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('Cache hit for', cacheKey);
      return new Response(
        JSON.stringify(cached.data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Kall MET API
    const userAgent = 'Avisafe/1.0 (kontakt@avisafe.no)';
    const metUrl = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${truncatedLat}&lon=${truncatedLon}`;
    
    console.log('Fetching weather from MET:', metUrl);
    
    const metResponse = await fetch(metUrl, {
      headers: {
        'User-Agent': userAgent,
      },
    });

    if (!metResponse.ok) {
      throw new Error(`MET API error: ${metResponse.status} ${metResponse.statusText}`);
    }

    const metData = await metResponse.json();

    const timeseries = metData.properties?.timeseries || [];

    // Finn prognosepunktet nærmest oppdragstidspunktet
    const targetIndex = findClosestIndex(timeseries, targetIso);
    const forecastEntry = timeseries[targetIndex];
    const forecastTime: string | null = forecastEntry?.time ?? null;

    // Utenfor rekkevidde hvis ønsket tid er mer enn 6 timer fra nærmeste punkt
    const outOfRange = !!targetIso && (
      !forecastTime ||
      Math.abs(new Date(forecastTime).getTime() - new Date(targetIso).getTime()) > 6 * 60 * 60 * 1000
    );

    // Evaluer værforhold for drone på måltidspunktet
    const { warnings, recommendation } = evaluateWeatherForDrone(metData, targetIndex);

    // Timeprognose: start litt før måltidspunktet
    const startIndex = targetIso ? Math.max(0, targetIndex - 3) : 0;
    const hourlyForecast = generateHourlyForecast(timeseries, startIndex);
    const bestFlightWindow = findBestFlightWindow(hourlyForecast);

    // Bygg response
    const current = forecastEntry?.data?.instant?.details;
    const next1h = forecastEntry?.data?.next_1_hours;
    const sixIndex = Math.min(targetIndex + 6, Math.max(0, timeseries.length - 1));
    const forecast6h = timeseries[sixIndex]?.data?.instant?.details;

    const response = {
      location: { lat: truncatedLat, lon: truncatedLon },
      timestamp: forecastTime || new Date().toISOString(),
      target_time: targetIso,
      forecast_time: forecastTime,
      out_of_range: outOfRange,
      current: {
        temperature: current?.air_temperature || null,
        wind_speed: current?.wind_speed || null,
        wind_gust: current?.wind_speed_of_gust || null,
        wind_direction: current?.wind_from_direction || null,
        humidity: current?.relative_humidity || null,
        dew_point: current?.dew_point_temperature ?? null,
        precipitation: next1h?.details?.precipitation_amount || 0,
        symbol: next1h?.summary?.symbol_code || 'unknown',
      },
      warnings,
      hourly_forecast: hourlyForecast,
      best_flight_window: bestFlightWindow,
      forecast_6h: forecast6h ? {
        temperature: forecast6h.air_temperature || null,
        wind_speed: forecast6h.wind_speed || null,
        precipitation: timeseries[sixIndex]?.data?.next_1_hours?.details?.precipitation_amount || 0,
      } : null,
      drone_flight_recommendation: recommendation,
      met_data_updated: metData.properties?.meta?.updated_at || null,
    };

    // Lagre i cache
    cache.set(cacheKey, { data: response, timestamp: Date.now() });

    // Rydd gammel cache (over 10 minutter)
    for (const [key, value] of cache.entries()) {
      if (Date.now() - value.timestamp > CACHE_TTL * 2) {
        cache.delete(key);
      }
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in drone-weather function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
