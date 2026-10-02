// Bygger ekstra HTML-seksjoner (personell, ressurser, luftrom, vær) for «nytt oppdrag»-e-posten.

const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export interface MissionDetailsInput {
  id?: string | null;
  tidspunkt: string;
  slutt_tidspunkt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  oppdragstype?: string | null;
  kunde?: string | null;
  merknader?: string | null;
  personell?: Array<string | { navn: string; rolle?: string | null }>;
  droner?: string[];
  utstyr?: string[];
  luftrom?: Array<{ zone_name?: string; zone_type?: string; level?: string; message?: string }>;
  risiko?: RiskSummary | null;
}

export interface RiskSummary {
  overall_score?: number | string | null;
  recommendation?: string | null;
  headline?: string | null;
  created_at?: string | null;
}

const L = {
  no: {
    personnel: 'Personell', drones: 'Droner', equipment: 'Utstyr', customer: 'Kunde', type: 'Oppdragstype', end: 'Slutt',
    notes: 'Merknader',
    airspace: 'Luftromsvarsler', noAirspace: 'Ingen kjente luftromsvarsler for området.',
    weather: 'Værvarsel for oppdragsstart', weatherNa: 'Værvarsel er ikke tilgjengelig ennå (for langt frem i tid eller mangler posisjon).',
    weatherNote: 'Været oppdateres fortløpende i AviSafe frem til oppdraget starter.',
    temp: 'Temperatur', wind: 'Vind', gust: 'kast', precip: 'Nedbør',
    rec: { ok: 'Gode forhold', caution: 'Vær forsiktig', warning: 'Frarådes' } as Record<string, string>,
    risk: 'Risikovurdering', riskNone: 'Det er ikke registrert noen risikovurdering på oppdraget ennå.',
    riskScore: 'Samlet score', riskDone: 'Vurdert',
    riskRec: { 'go': 'GO – akseptabel risiko', 'caution': 'CAUTION – vær forsiktig', 'no-go': 'NO-GO – frarådes' } as Record<string, string>,
    none: '—', noRole: '',
  },
  en: {
    personnel: 'Personnel', drones: 'Drones', equipment: 'Equipment', customer: 'Customer', type: 'Mission type', end: 'End',
    notes: 'Notes',
    airspace: 'Airspace warnings', noAirspace: 'No known airspace warnings for the area.',
    weather: 'Weather forecast at mission start', weatherNa: 'Weather forecast not available yet (too far ahead or missing position).',
    weatherNote: 'The weather is continuously updated in AviSafe until the mission starts.',
    temp: 'Temperature', wind: 'Wind', gust: 'gusts', precip: 'Precipitation',
    rec: { ok: 'Good conditions', caution: 'Use caution', warning: 'Not recommended' } as Record<string, string>,
    risk: 'Risk assessment', riskNone: 'No risk assessment has been registered for this mission yet.',
    riskScore: 'Overall score', riskDone: 'Assessed',
    riskRec: { 'go': 'GO – acceptable risk', 'caution': 'CAUTION – use caution', 'no-go': 'NO-GO – not recommended' } as Record<string, string>,
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
  void supabase;
  try {
    const lat = Math.round(Number(m.latitude) * 10000) / 10000;
    const lon = Math.round(Number(m.longitude) * 10000) / 10000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`, {
      headers: { 'User-Agent': 'Avisafe/1.0 (kontakt@avisafe.no)' },
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) { console.warn('mission weather MET error', res.status); return null; }
    const json = await res.json();
    const ts: any[] = json?.properties?.timeseries || [];
    if (!ts.length) return null;
    const target = Math.max(start.getTime(), Date.now());
    let best = ts[0], bestDiff = Infinity;
    for (const e of ts) {
      const diff = Math.abs(new Date(e.time).getTime() - target);
      if (diff < bestDiff) { bestDiff = diff; best = e; }
    }
    if (bestDiff > 6 * 3600e3) return null;
    const inst = best?.data?.instant?.details || {};
    const period = best?.data?.next_1_hours || best?.data?.next_6_hours || best?.data?.next_12_hours;
    const hours = best?.data?.next_1_hours ? 1 : best?.data?.next_6_hours ? 6 : 12;
    const precip = period?.details?.precipitation_amount ?? null;
    const wind = inst.wind_speed ?? null;
    const gust = inst.wind_speed_of_gust ?? null;
    const temp = inst.air_temperature ?? null;
    const precipPerH = precip != null ? precip / hours : 0;
    let rec = 'ok';
    if ((wind ?? 0) > 10 || (gust ?? 0) > 15 || precipPerH > 2) rec = 'warning';
    else if ((wind ?? 0) > 7 || (gust ?? 0) > 10 || precipPerH > 0.5 || (temp != null && temp < -10)) rec = 'caution';
    return {
      current: { temperature: temp, wind_speed: wind, wind_gust: gust, precipitation: precip },
      drone_flight_recommendation: rec,
    };
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

  const notesText = (m.merknader || '').trim();
  const notesHtml = notesText
    ? `<div style="margin-top:15px;"><p style="margin:0 0 6px 0;"><strong>${esc(t.notes)}</strong></p><p style="margin:0;white-space:pre-line;">${esc(notesText)}</p></div>`
    : '';

  const riskHtml = buildRiskHtml(m.risiko ?? null, lang);

  return {
    mission_resources: resourcesHtml,
    mission_airspace_warnings: airspaceHtml,
    mission_weather: weatherHtml,
    mission_notes: notesHtml,
    mission_risk: riskHtml,
    mission_personnel: list(personnel),
    mission_drones: list(m.droner || []),
    mission_equipment: list(m.utstyr || []),
    mission_details: notesHtml + resourcesHtml + airspaceHtml + weatherHtml,
  };
}

const riskColor = (rec?: string | null, score?: number | null) => {
  const r = (rec || '').toLowerCase();
  if (r === 'no-go' || (score != null && score < 5)) return '#dc2626';
  if (r === 'caution' || (score != null && score < 7)) return '#d97706';
  if (r === 'go') return '#16a34a';
  return '#2563eb';
};

export function buildRiskHtml(risk: RiskSummary | null, lang: 'no' | 'en'): string {
  const t = L[lang] ?? L.no;
  if (!risk) {
    return `<div style="margin-top:15px;"><p style="margin:0 0 6px 0;"><strong>${esc(t.risk)}</strong></p><p style="margin:0;color:#666;">${esc(t.riskNone)}</p></div>`;
  }
  const score = risk.overall_score == null ? null : Number(risk.overall_score);
  const rec = (risk.recommendation || '').toLowerCase();
  const recText = t.riskRec[rec] || (rec ? rec.toUpperCase() : '');
  const color = riskColor(rec, Number.isFinite(score as number) ? (score as number) : null);
  const scoreText = Number.isFinite(score as number) ? `${(score as number).toFixed(1)} / 10` : t.none;
  const headline = (risk.headline || '').trim();
  return `<div style="margin-top:15px;"><p style="margin:0 0 6px 0;"><strong>${esc(t.risk)}</strong></p>`
    + `<div style="border-left:4px solid ${color};padding:8px 10px;background:#f9fafb;">`
    + `<div style="font-size:16px;"><strong style="color:${color};">${esc(recText)}</strong></div>`
    + `<div style="margin-top:4px;">${esc(t.riskScore)}: <strong>${esc(scoreText)}</strong></div>`
    + (headline ? `<div style="margin-top:6px;font-size:13px;">${esc(headline)}</div>` : '')
    + `</div></div>`;
}

const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

/** Samme luftromssjekk som oppdragskortet (check_mission_airspace per rute, worst case). */
async function loadMissionAirspace(supabase: any, mission: any) {
  const lat = mission.latitude, lng = mission.longitude;
  if (lat == null || lng == null) return [];
  const route = mission.route as any;
  const runs: Array<any[] | null> = Array.isArray(route?.routes) && route.routes.length
    ? route.routes.map((r: any) => (r?.coordinates?.length ? r.coordinates : null))
    : [route?.coordinates?.length ? route.coordinates : null];
  const merged = new Map<string, any>();
  for (const pts of runs) {
    const { data, error } = await supabase.rpc('check_mission_airspace', { p_lat: lat, p_lng: lng, p_route: pts });
    if (error) { console.error('check_mission_airspace failed', error); continue; }
    for (const r of (data || []) as any[]) {
      const key = `${r.z_type}|${r.z_name}`;
      const ex = merged.get(key);
      if (!ex) merged.set(key, { ...r });
      else {
        ex.route_inside = ex.route_inside || r.route_inside;
        ex.min_distance = Math.min(ex.min_distance ?? r.min_distance, r.min_distance);
      }
    }
  }
  const order: Record<string, number> = { warning: 0, caution: 1, note: 2 };
  return [...merged.values()].map((r) => {
    const inside = !!r.route_inside;
    const special = (r.z_type === '5KM' || r.z_type === 'ATZ_5KM') && inside;
    const level = r.z_type === 'CAA_VERNEOMRADER_OBS' && inside ? 'note' : special ? 'warning' : inside
      ? (r.severity === 'WARNING' ? 'warning' : 'caution')
      : (r.severity === 'WARNING' ? 'caution' : 'note');
    const name = String(r.z_name || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const nature = r.z_type === 'CAA_VERNEOMRADER_FORBUD' || r.z_type === 'CAA_VERNEOMRADER_OBS';
    const message = nature
      ? `${r.z_type === 'CAA_VERNEOMRADER_FORBUD' ? 'Verneområde med droneforbud' : 'Verneområde uten registrert droneforbud'}: ${inside ? 'ruten går gjennom området' : `${fmtDist(r.min_distance ?? 0)} fra ruten`}`
      : inside ? `${r.z_type}: ruten går inne i sonen` : `${r.z_type}: ${fmtDist(r.min_distance ?? 0)} fra ruten`;
    return { zone_name: name, zone_type: r.z_type, level, message };
  }).sort((a, b) => (order[a.level] ?? 3) - (order[b.level] ?? 3));
}

/** Henter oppdragsdetaljer + siste risikovurdering direkte fra databasen (brukes av godkjenningsvarselet). */
export async function loadMissionDetailsInput(supabase: any, missionId: string): Promise<MissionDetailsInput | null> {
  const { data: mission } = await supabase
    .from('missions')
    .select('id, tidspunkt, slutt_tidspunkt, latitude, longitude, route, oppdragstype, oppdragstype_annet, merknader, customer_id, company_id')
    .eq('id', missionId)
    .maybeSingle();
  if (!mission) return null;

  const [{ data: personRows }, { data: droneRows }, { data: equipRows }, { data: riskRows }, { data: customer }] = await Promise.all([
    supabase.from('mission_personnel').select('profile_id, role_id').eq('mission_id', missionId),
    supabase.from('mission_drones').select('drone_id').eq('mission_id', missionId),
    supabase.from('mission_equipment').select('equipment_id').eq('mission_id', missionId),
    supabase.from('mission_risk_assessments').select('overall_score, recommendation, ai_analysis, airspace_warnings, created_at').eq('mission_id', missionId).order('created_at', { ascending: false }).limit(1),
    mission.customer_id
      ? supabase.from('customers').select('navn').eq('id', mission.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const profileIds = (personRows || []).map((r: any) => r.profile_id).filter(Boolean);
  const roleIds = (personRows || []).map((r: any) => r.role_id).filter(Boolean);
  const droneIds = (droneRows || []).map((r: any) => r.drone_id).filter(Boolean);
  const equipIds = (equipRows || []).map((r: any) => r.equipment_id).filter(Boolean);

  const [{ data: profiles }, { data: roles }, { data: drones }, { data: equipment }] = await Promise.all([
    profileIds.length ? supabase.from('profiles').select('id, full_name').in('id', profileIds) : Promise.resolve({ data: [] }),
    roleIds.length ? supabase.from('company_mission_roles').select('id, name').in('id', roleIds) : Promise.resolve({ data: [] }),
    droneIds.length ? supabase.from('drones').select('id, modell, serienummer, dji_aircraft_name').in('id', droneIds) : Promise.resolve({ data: [] }),
    equipIds.length ? supabase.from('equipment').select('id, navn').in('id', equipIds) : Promise.resolve({ data: [] }),
  ]);

  const profileName = new Map((profiles || []).map((p: any) => [p.id, p.full_name]));
  const roleName = new Map((roles || []).map((r: any) => [r.id, r.name]));

  const risk = (riskRows || [])[0];
  const analysis = risk?.ai_analysis && typeof risk.ai_analysis === 'object' ? risk.ai_analysis as any : null;

  return {
    id: mission.id,
    tidspunkt: mission.tidspunkt,
    slutt_tidspunkt: mission.slutt_tidspunkt,
    latitude: mission.latitude,
    longitude: mission.longitude,
    oppdragstype: mission.oppdragstype === 'Annet' && mission.oppdragstype_annet ? mission.oppdragstype_annet : mission.oppdragstype,
    kunde: (customer as any)?.navn ?? null,
    merknader: mission.merknader,
    personell: (personRows || []).map((r: any) => ({
      navn: profileName.get(r.profile_id) || '',
      rolle: r.role_id ? (roleName.get(r.role_id) || null) : null,
    })).filter((p: any) => p.navn),
    droner: (drones || []).map((d: any) => [d.modell, d.dji_aircraft_name || d.serienummer].filter(Boolean).join(' – ')).filter(Boolean),
    utstyr: (equipment || []).map((e: any) => e.navn).filter(Boolean),
    luftrom: await loadMissionAirspace(supabase, mission),
    risiko: risk
      ? {
          overall_score: risk.overall_score,
          recommendation: risk.recommendation,
          headline: typeof analysis?.summary === 'string' ? analysis.summary.slice(0, 400) : null,
          created_at: risk.created_at,
        }
      : null,
  };
}
