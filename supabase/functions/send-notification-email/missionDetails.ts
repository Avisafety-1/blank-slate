// Bygger ekstra HTML-seksjoner (personell, ressurser, luftrom, vær) for «nytt oppdrag»-e-posten.

const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export interface MissionDetailsInput {
  tidspunkt: string;
  slutt_tidspunkt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  oppdragstype?: string | null;
  kunde?: string | null;
  personell?: Array<string | { navn: string; rolle?: string | null }>;
  droner?: string[];
  utstyr?: string[];
  luftrom?: Array<{ zone_name?: string; zone_type?: string; level?: string; message?: string }>;
}

const L = {
  no: {
    personnel: 'Personell', drones: 'Droner', equipment: 'Utstyr', customer: 'Kunde', type: 'Oppdragstype', end: 'Slutt',
    airspace: 'Luftromsvarsler', noAirspace: 'Ingen kjente luftromsvarsler for området.',
    weather: 'Værvarsel for oppdragsstart', weatherNa: 'Værvarsel er ikke tilgjengelig ennå (for langt frem i tid eller mangler posisjon).',
    weatherNote: 'Været oppdateres fortløpende i AviSafe frem til oppdraget starter.',
    temp: 'Temperatur', wind: 'Vind', gust: 'kast', precip: 'Nedbør',
    rec: { ok: 'Gode forhold', caution: 'Vær forsiktig', warning: 'Frarådes' } as Record<string, string>,
    none: '—', noRole: '',
  },
  en: {
    personnel: 'Personnel', drones: 'Drones', equipment: 'Equipment', customer: 'Customer', type: 'Mission type', end: 'End',
    airspace: 'Airspace warnings', noAirspace: 'No known airspace warnings for the area.',
    weather: 'Weather forecast at mission start', weatherNa: 'Weather forecast not available yet (too far ahead or missing position).',
    weatherNote: 'The weather is continuously updated in AviSafe until the mission starts.',
    temp: 'Temperature', wind: 'Wind', gust: 'gusts', precip: 'Precipitation',
    rec: { ok: 'Good conditions', caution: 'Use caution', warning: 'Not recommended' } as Record<string, string>,
    none: '—', noRole: '',
  },
};

const levelColor = (l?: string) => l === 'warning' ? '#dc2626' : l === 'caution' ? '#d97706' : '#2563eb';

async function fetchWeather(supabase: any, m: MissionDetailsInput) {
  if (m.latitude == null || m.longitude == null) return null;
  const start = new Date(m.tidspunkt);
  if (!Number.isFinite(start.getTime())) return null;
  // MET har ca. 9-10 dagers varsel
  if (start.getTime() - Date.now() > 9 * 24 * 3600e3) return null;
  try {
    const res = await Promise.race([
      supabase.functions.invoke('drone-weather', { body: { lat: m.latitude, lon: m.longitude, targetTime: start.toISOString() } }),
      new Promise((r) => setTimeout(() => r({ data: null }), 8000)),
    ]) as any;
    const d = res?.data;
    if (!d || d.error || d.out_of_range || !d.current) return null;
    return d;
  } catch (e) {
    console.warn('mission weather fetch failed', e);
    return null;
  }
}

export async function buildMissionDetails(supabase: any, m: MissionDetailsInput, lang: 'no' | 'en', dateLocale: string) {
  const t = L[lang] ?? L.no;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#666;vertical-align:top;width:140px;"><strong>${esc(label)}:</strong></td><td style="padding:6px 0;">${value}</td></tr>`;
  const list = (items: string[]) => items.length ? items.map(esc).join('<br>') : t.none;

  const personnel = (m.personell || []).map((p) => typeof p === 'string'
    ? p : (p.rolle ? `${p.navn} – ${p.rolle}` : p.navn)).filter(Boolean) as string[];
  const endText = m.slutt_tidspunkt && Number.isFinite(new Date(m.slutt_tidspunkt).getTime())
    ? new Date(m.slutt_tidspunkt).toLocaleString(dateLocale, { timeZone: 'Europe/Oslo', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  let rows = '';
  if (endText) rows += row(t.end, esc(endText));
  if (m.oppdragstype) rows += row(t.type, esc(m.oppdragstype));
  if (m.kunde) rows += row(t.customer, esc(m.kunde));
  rows += row(t.personnel, list(personnel));
  rows += row(t.drones, list(m.droner || []));
  if ((m.utstyr || []).length) rows += row(t.equipment, list(m.utstyr || []));
  const resourcesHtml = `<table style="width:100%;margin-top:10px;">${rows}</table>`;

  const warnings = (m.luftrom || []).slice(0, 15);
  const airspaceHtml = `<div style="margin-top:15px;"><p style="margin:0 0 6px 0;"><strong>${esc(t.airspace)}</strong></p>${
    warnings.length
      ? warnings.map((w) => `<div style="border-left:4px solid ${levelColor(w.level)};padding:6px 10px;margin:4px 0;background:#f9fafb;"><strong>${esc(w.zone_name || w.zone_type || '')}</strong>${w.message ? `<br><span style="font-size:13px;">${esc(w.message)}</span>` : ''}</div>`).join('')
      : `<p style="margin:0;color:#666;">${esc(t.noAirspace)}</p>`
  }</div>`;

  const w = await fetchWeather(supabase, m);
  let weatherBody: string;
  if (w) {
    const c = w.current;
    const parts: string[] = [];
    if (c.temperature != null) parts.push(`${t.temp}: ${Math.round(c.temperature)} °C`);
    if (c.wind_speed != null) parts.push(`${t.wind}: ${Number(c.wind_speed).toFixed(1)} m/s${c.wind_gust != null ? ` (${t.gust} ${Number(c.wind_gust).toFixed(1)})` : ''}`);
    if (c.precipitation != null) parts.push(`${t.precip}: ${c.precipitation} mm`);
    const rec = w.drone_flight_recommendation;
    const recText = t.rec[rec];
    weatherBody = `${recText ? `<div style="border-left:4px solid ${levelColor(rec === 'ok' ? 'note' : rec)};padding:6px 10px;margin:4px 0;background:#f9fafb;"><strong>${esc(recText)}</strong></div>` : ''}<p style="margin:4px 0;">${esc(parts.join(' · '))}</p>`;
  } else {
    weatherBody = `<p style="margin:0;color:#666;">${esc(t.weatherNa)}</p>`;
  }
  const weatherHtml = `<div style="margin-top:15px;"><p style="margin:0 0 6px 0;"><strong>${esc(t.weather)}</strong></p>${weatherBody}<p style="margin:6px 0 0 0;font-size:12px;color:#666;font-style:italic;">${esc(t.weatherNote)}</p></div>`;

  return {
    mission_resources: resourcesHtml,
    mission_airspace_warnings: airspaceHtml,
    mission_weather: weatherHtml,
    mission_personnel: list(personnel),
    mission_drones: list(m.droner || []),
    mission_equipment: list(m.utstyr || []),
    mission_details: resourcesHtml + airspaceHtml + weatherHtml,
  };
}
