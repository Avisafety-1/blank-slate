/**
 * Regelsett og hjelpefunksjoner for naturvernområder (Naturbase).
 * Brukes til å bygge utvidet popup/dialog med drone-relevante regler,
 * forvaltningsmyndighet og søknadslenker.
 *
 * Datakilde: Miljødirektoratet Naturbase (felt fra `properties`-JSONB):
 *   - naturvernId  → faktaark-URL (https://faktaark.naturbase.no/?id=<id>)
 *   - verneform / verneformAggregert
 *   - forvaltningsmyndighet, forvaltningsmyndighetType
 *   - vernedato (ms epoch), iucn, kommune, verneplan, verneforskrift, faktaark
 */

export const MILJODIR_DRONE_RULES_URL =
  'https://www.miljodirektoratet.no/ansvarsomrader/vernet-natur/regler-for-droner-i-naturen/';

export type VerneformStatus = 'FORBUDT' | 'SJEKK_FORSKRIFT' | 'BEGRENSET' | 'AKTSOMHET';

export interface VerneformRule {
  /** Visningsnavn på norsk (æøå). */
  label: string;
  /** Kort hovedregel for droneflyging (bakoverkompatibel — vises ikke i ny popup). */
  rule: string;
  /** Lovhjemmel-referanse i klartekst (ingen Lovdata-URL). */
  legalBasis: string;
  /** Farge for badge — matcher eksisterende verneformColors. */
  color: string;
  /** Status-nivå som driver fargen/overskriften på popup-badgen. */
  status: VerneformStatus;
  /** Kort, handlingsrettet råd til droneflygeren — 1–2 setninger. */
  pilotAdvice: string;
}

export interface StatusPresentation {
  label: string;
  icon: string;
  /** Tekstfarge (mørk). */
  color: string;
  /** Bakgrunnsfarge (lys). */
  bg: string;
  /** Border/accent-farge. */
  border: string;
}

const STATUS_PRESENTATION: Record<VerneformStatus, StatusPresentation> = {
  FORBUDT: {
    label: 'Droneflyging forbudt',
    icon: '🚫',
    color: '#7f1d1d',
    bg: '#fee2e2',
    border: '#dc2626',
  },
  SJEKK_FORSKRIFT: {
    label: 'Sjekk verneforskriften',
    icon: '⚠️',
    color: '#78350f',
    bg: '#fef3c7',
    border: '#d97706',
  },
  BEGRENSET: {
    label: 'Begrenset — krever dispensasjon',
    icon: '⚠️',
    color: '#7c2d12',
    bg: '#ffedd5',
    border: '#ea580c',
  },
  AKTSOMHET: {
    label: 'Aktsomhetsplikt',
    icon: 'ℹ️',
    color: '#1e3a8a',
    bg: '#dbeafe',
    border: '#2563eb',
  },
};

export function getStatusPresentation(status: VerneformStatus): StatusPresentation {
  return STATUS_PRESENTATION[status];
}

/**
 * Sentralt regelsett per `verneform`-verdi fra Naturbase.
 * Råd er basert på Miljødirektoratets veileder
 * (https://www.miljodirektoratet.no/ansvarsomrader/vernet-natur/regler-for-droner-i-naturen/).
 */
export const VERNEFORM_RULES: Record<string, VerneformRule> = {
  Nasjonalpark: {
    label: 'Nasjonalpark',
    rule: 'Droneflyging er som hovedregel forbudt. Krever dispensasjon fra forvaltningsmyndigheten.',
    legalBasis: 'Naturmangfoldloven § 35 og verneforskriften for området.',
    color: '#15803d',
    status: 'FORBUDT',
    pilotAdvice:
      'Droneflyging er forbudt — også å fly inn fra utsiden eller lette like utenfor grensen. Du må ha tillatelse fra nasjonalparkstyret før du flyr.',
  },
  NasjonalparkSvalbard: {
    label: 'Nasjonalpark (Svalbard)',
    rule: 'Droneflyging er forbudt uten tillatelse fra Sysselmesteren.',
    legalBasis: 'Svalbardmiljøloven og verneforskriften.',
    color: '#15803d',
    status: 'FORBUDT',
    pilotAdvice: 'Droneflyging krever tillatelse fra Sysselmesteren på Svalbard.',
  },
  Naturreservat: {
    label: 'Naturreservat',
    rule: 'Droneflyging er normalt forbudt. Krever dispensasjon fra forvaltningsmyndigheten.',
    legalBasis: 'Naturmangfoldloven § 37 og verneforskriften for området.',
    color: '#166534',
    status: 'SJEKK_FORSKRIFT',
    pilotAdvice:
      'Sjekk verneforskriften i faktaarket. Står «modellfly o.l.» nevnt, er droner forbudt. Forstyrrelse av dyreliv er uansett ulovlig — særlig ved hekking eller raste-/yngletid.',
  },
  NaturreservatSvalbard: {
    label: 'Naturreservat (Svalbard)',
    rule: 'Droneflyging er forbudt uten tillatelse fra Sysselmesteren.',
    legalBasis: 'Svalbardmiljøloven og verneforskriften.',
    color: '#166534',
    status: 'FORBUDT',
    pilotAdvice: 'Droneflyging krever tillatelse fra Sysselmesteren på Svalbard.',
  },
  NaturreservatJanMayen: {
    label: 'Naturreservat (Jan Mayen)',
    rule: 'Droneflyging er forbudt uten særskilt tillatelse.',
    legalBasis: 'Verneforskrift for Jan Mayen.',
    color: '#166534',
    status: 'FORBUDT',
    pilotAdvice: 'Hele Jan Mayen er naturreservat — droneflyging krever særskilt tillatelse.',
  },
  Landskapsvernomraade: {
    label: 'Landskapsvernområde',
    rule: 'Droneflyging er ofte begrenset og kan kreve dispensasjon. Sjekk verneforskriften.',
    legalBasis: 'Naturmangfoldloven § 36 og verneforskriften for området.',
    color: '#4ade80',
    status: 'SJEKK_FORSKRIFT',
    pilotAdvice:
      'I større landskapsvernområder er droner forbudt. I mindre kan det være tillatt — sjekk verneforskriften i faktaarket før du flyr.',
  },
  LandskapsvernomraadeDyrelivsfredning: {
    label: 'Landskapsvernområde med dyrelivsfredning',
    rule: 'Droneflyging er begrenset, særlig i hekkesesongen. Krever ofte dispensasjon.',
    legalBasis: 'Naturmangfoldloven § 36 og verneforskriften.',
    color: '#4ade80',
    status: 'BEGRENSET',
    pilotAdvice:
      'Forstyrrelse av dyreliv er forbudt — særlig i hekke-/yngletid. Krever som regel dispensasjon.',
  },
  LandskapsvernomraadePlantelivsfredning: {
    label: 'Landskapsvernområde med plantelivsfredning',
    rule: 'Droneflyging er begrenset. Sjekk verneforskriften.',
    legalBasis: 'Naturmangfoldloven § 36 og verneforskriften.',
    color: '#4ade80',
    status: 'SJEKK_FORSKRIFT',
    pilotAdvice: 'Landing og oppstart er ofte forbudt. Sjekk verneforskriften i faktaarket.',
  },
  LandskapsvernomraadePlanteOgDyrelivsfredning: {
    label: 'Landskapsvernområde med plante- og dyrelivsfredning',
    rule: 'Droneflyging er begrenset, særlig i hekkesesongen. Krever ofte dispensasjon.',
    legalBasis: 'Naturmangfoldloven § 36 og verneforskriften.',
    color: '#4ade80',
    status: 'BEGRENSET',
    pilotAdvice:
      'Forstyrrelse av dyre- og planteliv er forbudt — særlig i hekke-/yngletid. Krever som regel dispensasjon.',
  },
  LandskapsvernomraadeBiotopvern: {
    label: 'Landskapsvernområde med biotopvern',
    rule: 'Droneflyging er begrenset. Krever ofte dispensasjon.',
    legalBasis: 'Naturmangfoldloven § 36 og verneforskriften.',
    color: '#4ade80',
    status: 'BEGRENSET',
    pilotAdvice: 'Biotopen er sårbar — droneflyging krever som regel dispensasjon.',
  },
  Biotopvern: {
    label: 'Biotopvernområde',
    rule: 'Droneflyging er forbudt eller sterkt begrenset, særlig i hekke-/yngletid.',
    legalBasis: 'Naturmangfoldloven § 38 og verneforskriften.',
    color: '#22c55e',
    status: 'BEGRENSET',
    pilotAdvice:
      'Forstyrrelse av fugleliv er forbudt — særlig hekke-/yngletid. Krever som regel dispensasjon.',
  },
  BiotopvernVilt: {
    label: 'Biotopvernområde (vilt)',
    rule: 'Droneflyging er forbudt eller sterkt begrenset, særlig i hekke-/yngletid.',
    legalBasis: 'Viltloven § 7 og verneforskriften.',
    color: '#22c55e',
    status: 'BEGRENSET',
    pilotAdvice:
      'Forstyrrelse av vilt er forbudt — særlig hekke-/yngletid. Krever som regel dispensasjon.',
  },
  MarintVerneomraade: {
    label: 'Marint verneområde',
    rule: 'Ingen egne droneregler, men sjekk nærliggende verneområder.',
    legalBasis: 'Naturmangfoldloven § 39 og verneforskriften.',
    color: '#0ea5e9',
    status: 'AKTSOMHET',
    pilotAdvice:
      'Ingen egne droneregler her, men aktsomhetsplikt etter nml § 6. Marine verneområder grenser ofte til naturreservat eller nasjonalpark — sjekk nabosonene.',
  },
  Dyrefredningsomrade: {
    label: 'Dyrefredningsområde',
    rule: 'Droneflyging er som hovedregel forbudt i hekke-/yngletid. Krever dispensasjon.',
    legalBasis: 'Naturmangfoldloven og verneforskriften.',
    color: '#a3e635',
    status: 'BEGRENSET',
    pilotAdvice:
      'Forstyrrelse av dyreliv er forbudt — særlig hekke-/yngletid. Krever som regel dispensasjon.',
  },
  Dyrelivsfredning: {
    label: 'Dyrelivsfredning',
    rule: 'Droneflyging er begrenset, særlig i hekke-/yngletid.',
    legalBasis: 'Naturmangfoldloven og verneforskriften.',
    color: '#a3e635',
    status: 'BEGRENSET',
    pilotAdvice:
      'Forstyrrelse av dyreliv er forbudt — særlig hekke-/yngletid. Hold god avstand eller søk dispensasjon.',
  },
  Plantefredningsomraade: {
    label: 'Plantefredningsområde',
    rule: 'Landing og oppstart er ofte forbudt. Overflyging kan være tillatt.',
    legalBasis: 'Naturmangfoldloven og verneforskriften.',
    color: '#84cc16',
    status: 'SJEKK_FORSKRIFT',
    pilotAdvice: 'Landing og oppstart er ofte forbudt. Overflyging kan være tillatt — sjekk verneforskriften.',
  },
  Plantelivsfredning: {
    label: 'Plantelivsfredning',
    rule: 'Landing og oppstart er ofte forbudt. Sjekk verneforskriften.',
    legalBasis: 'Naturmangfoldloven og verneforskriften.',
    color: '#84cc16',
    status: 'SJEKK_FORSKRIFT',
    pilotAdvice: 'Landing og oppstart er ofte forbudt. Sjekk verneforskriften i faktaarket.',
  },
  PlanteOgDyrefredningsomraade: {
    label: 'Plante- og dyrefredningsområde',
    rule: 'Droneflyging er begrenset, særlig i hekke-/yngletid. Krever ofte dispensasjon.',
    legalBasis: 'Naturmangfoldloven og verneforskriften.',
    color: '#a3e635',
    status: 'BEGRENSET',
    pilotAdvice:
      'Forstyrrelse av dyre- og planteliv er forbudt — særlig hekke-/yngletid. Krever som regel dispensasjon.',
  },
  PlanteOgDyrelivsfredning: {
    label: 'Plante- og dyrelivsfredning',
    rule: 'Droneflyging er begrenset, særlig i hekke-/yngletid.',
    legalBasis: 'Naturmangfoldloven og verneforskriften.',
    color: '#a3e635',
    status: 'BEGRENSET',
    pilotAdvice:
      'Forstyrrelse av dyre- og planteliv er forbudt — særlig hekke-/yngletid. Hold god avstand eller søk dispensasjon.',
  },
  Naturminne: {
    label: 'Naturminne',
    rule: 'Området er fredet — sjekk verneforskriften før droneflyging.',
    legalBasis: 'Naturmangfoldloven og verneforskriften.',
    color: '#16a34a',
    status: 'SJEKK_FORSKRIFT',
    pilotAdvice: 'Lite, fredet objekt. Sjekk verneforskriften i faktaarket før du flyr.',
  },
  GeotopvernSvalbard: {
    label: 'Geotopvern (Svalbard)',
    rule: 'Droneflyging krever tillatelse fra Sysselmesteren.',
    legalBasis: 'Svalbardmiljøloven.',
    color: '#16a34a',
    status: 'FORBUDT',
    pilotAdvice: 'Droneflyging krever tillatelse fra Sysselmesteren på Svalbard.',
  },
  MidlertidigVernaOmraade: {
    label: 'Midlertidig vernet område',
    rule: 'Området har midlertidig vern — antas å ha samme restriksjoner som tilsvarende permanente vern.',
    legalBasis: 'Naturmangfoldloven § 45.',
    color: '#16a34a',
    status: 'SJEKK_FORSKRIFT',
    pilotAdvice:
      'Midlertidig vernet — behandles som tilsvarende permanent vern. Sjekk forskriften i faktaarket.',
  },
};

const DEFAULT_RULE: VerneformRule = {
  label: 'Naturvernområde',
  rule: 'Droneflyging kan være begrenset. Sjekk verneforskriften før flyging.',
  legalBasis: 'Naturmangfoldloven og verneforskriften for området.',
  color: '#16a34a',
  status: 'SJEKK_FORSKRIFT',
  pilotAdvice: 'Verneform er ukjent — sjekk verneforskriften i faktaarket før du flyr.',
};

export function getVerneformRule(verneform: string | null | undefined): VerneformRule {
  if (!verneform) return DEFAULT_RULE;
  return VERNEFORM_RULES[verneform] ?? DEFAULT_RULE;
}


export interface NatureAreaEnrichment {
  faktaarkUrl: string | null;
  forvaltningsmyndighet: string | null;
  forvaltningsmyndighetType: string | null;
  /** Norsk dato 'DD.MM.YYYY' eller null. */
  vernedatoFormatted: string | null;
  iucn: string | null;
  kommune: string | null;
  verneplan: string | null;
  /** URL til veiledning/søknad om dispensasjon hos forvaltningsmyndighet. */
  dispensasjonUrl: string | null;
  /** Knappetekst tilpasset myndigheten (f.eks. «Veiledning hos Statsforvalteren i Trøndelag»). */
  dispensasjonLabel: string;
  /** Sikker melding-lenke for å faktisk sende søknad (kun for Statsforvalter). */
  sikkerMeldingUrl: string | null;
  kontaktTlf: string | null;
  kontaktEpost: string | null;
}

/**
 * Faktiske URL-slugger til statsforvalterembetene på statsforvalteren.no.
 * Verifisert ved oppslag på live-sidene desember 2024 / juni 2026.
 */
const STATSFORVALTER_SLUGS: Record<string, string> = {
  'statsforvalteren i oslo og viken': 'oslo-og-viken',
  'statsforvalteren i østfold, buskerud, oslo og akershus': 'ostfold-buskerud-oslo-og-akershus',
  'statsforvalteren i innlandet': 'innlandet',
  'statsforvalteren i vestfold og telemark': 'vestfold-og-telemark',
  'statsforvalteren i agder': 'agder',
  'statsforvalteren i rogaland': 'rogaland',
  'statsforvalteren i vestland': 'vestland',
  'statsforvalteren i møre og romsdal': 'more-og-romsdal',
  'statsforvalteren i trøndelag': 'trondelag',
  'statsforvalteren i nordland': 'nordland',
  'statsforvalteren i troms og finnmark': 'troms-finnmark',
  'statsforvalteren i troms': 'troms-finnmark',
  'statsforvalteren i finnmark': 'troms-finnmark',
};

/** Stabil verneområde-side hos hvert embete — inneholder kontaktinfo og veiledning. */
const STATSFORVALTER_VERNE_PATH = '/miljo-og-klima/verneomrader/';
/** Felles Sikker melding-portal for innsending av søknader. */
const STATSFORVALTER_SIKKER_MELDING = 'https://www.statsforvalteren.no/melding';
const NASJONALPARKSTYRE_BASE = 'https://www.nasjonalparkstyre.no/';
const SYSSELMESTER_URL = 'https://www.sysselmesteren.no/miljovern/verneomrader/';
const STATSFORVALTER_FALLBACK = 'https://www.statsforvalteren.no/';

function slugifyNorwegian(name: string): string {
  return name
    .toLowerCase()
    .replace(/æ/g, 'a')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function statsforvalterVerneUrl(forvaltningsmyndighet: string): string {
  const key = forvaltningsmyndighet.trim().toLowerCase();
  const slug = STATSFORVALTER_SLUGS[key];
  if (!slug) return STATSFORVALTER_FALLBACK;
  return `https://www.statsforvalteren.no/${slug}${STATSFORVALTER_VERNE_PATH}`;
}

function nasjonalparkstyreUrl(forvaltningsmyndighet: string): string {
  const cleaned = forvaltningsmyndighet
    .replace(/^verneområdestyret?\s+for\s+/i, '')
    .replace(/^nasjonalparkstyret?\s+for\s+/i, '')
    .replace(/\s+(nasjonalparkstyre|verneområdestyre)$/i, '')
    .replace(/\s+(landskapsvernområde|nasjonalpark|naturreservat)$/i, '')
    .trim();
  if (!cleaned) return NASJONALPARKSTYRE_BASE;
  const slug = slugifyNorwegian(cleaned);
  if (!slug) return NASJONALPARKSTYRE_BASE;
  return `${NASJONALPARKSTYRE_BASE}${slug}/`;
}

function formatVernedato(value: unknown): string | null {
  if (value == null) return null;
  const ms = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface DispensasjonResult {
  url: string | null;
  label: string;
  sikkerMeldingUrl: string | null;
}

function resolveDispensasjon(
  forvaltningsmyndighet: string | null,
  type: string | null,
  faktaarkUrl: string | null,
): DispensasjonResult {
  const t = (type || '').toLowerCase();
  const m = (forvaltningsmyndighet || '').toLowerCase();

  if (t.includes('sysselmester') || m.includes('sysselmester')) {
    return { url: SYSSELMESTER_URL, label: 'Veiledning hos Sysselmesteren', sikkerMeldingUrl: null };
  }
  if (
    t.includes('verneomraadestyre') ||
    t.includes('nasjonalparkstyre') ||
    m.includes('verneområdestyre') ||
    m.includes('nasjonalparkstyre')
  ) {
    return {
      url: forvaltningsmyndighet ? nasjonalparkstyreUrl(forvaltningsmyndighet) : NASJONALPARKSTYRE_BASE,
      label: forvaltningsmyndighet ? `Veiledning hos ${forvaltningsmyndighet}` : 'Veiledning hos verneområdestyret',
      sikkerMeldingUrl: null,
    };
  }
  if (t.includes('statsforvalter') || m.includes('statsforvalteren')) {
    return {
      url: forvaltningsmyndighet ? statsforvalterVerneUrl(forvaltningsmyndighet) : STATSFORVALTER_FALLBACK,
      label: forvaltningsmyndighet ? `Veiledning hos ${forvaltningsmyndighet}` : 'Veiledning hos Statsforvalteren',
      sikkerMeldingUrl: STATSFORVALTER_SIKKER_MELDING,
    };
  }
  if (t.includes('kommune') || m.includes(' kommune')) {
    return {
      url: faktaarkUrl,
      label: forvaltningsmyndighet ? `Kontakt ${forvaltningsmyndighet}` : 'Kontakt forvaltningsmyndighet',
      sikkerMeldingUrl: null,
    };
  }
  return { url: STATSFORVALTER_FALLBACK, label: 'Veiledning hos Statsforvalteren', sikkerMeldingUrl: null };
}

export function enrichNatureArea(properties: Record<string, any> | null | undefined): NatureAreaEnrichment {
  const p = properties || {};
  const naturvernId: string | null = p.naturvernId || null;
  const faktaarkFromProps: string | null = typeof p.faktaark === 'string' ? p.faktaark : null;
  const faktaarkUrl = faktaarkFromProps
    || (naturvernId ? `https://faktaark.naturbase.no/?id=${encodeURIComponent(naturvernId)}` : null);

  const forvaltningsmyndighet: string | null = p.forvaltningsmyndighet || null;
  const forvaltningsmyndighetType: string | null = p.forvaltningsmyndighetType || null;
  const disp = resolveDispensasjon(forvaltningsmyndighet, forvaltningsmyndighetType, faktaarkUrl);

  return {
    faktaarkUrl,
    forvaltningsmyndighet,
    forvaltningsmyndighetType,
    vernedatoFormatted: formatVernedato(p.vernedato),
    iucn: typeof p.iucn === 'string' ? p.iucn.replace(/^IUCN_/, '') : null,
    kommune: p.kommune || null,
    verneplan: p.verneplan || null,
    dispensasjonUrl: disp.url,
    dispensasjonLabel: disp.label,
    sikkerMeldingUrl: disp.sikkerMeldingUrl,
    kontaktTlf: null,
    kontaktEpost: null,
  };
}

// ============ Delt popup-bygger ============

const VERNEFORM_BADGE_COLORS: Record<string, string> = {
  Nasjonalpark: '#15803d',
  Naturreservat: '#166534',
  Landskapsvernområde: '#4ade80',
  Biotopvernområde: '#22c55e',
  'Marint verneområde': '#0ea5e9',
  Dyrefredningsområde: '#a3e635',
  Plantefredningsområde: '#84cc16',
};

const escNatureHtml = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export interface NatureZonePopupInput {
  name?: string | null;
  verneform?: string | null;
  /** Naturbase `properties`-JSONB (input til enrichNatureArea). */
  properties?: Record<string, any> | null;
  /** Ekstra HTML som legges nederst i popupen (f.eks. "Auto-vist langs ruten"-merke). */
  extraFooterHtml?: string;
}

/**
 * Bygger den fulle naturvern-popupen (statusbadge, droneråd, metadata,
 * faktaark/dispensasjon-knapper). Brukes både fra hovedkartets verneområde-lag
 * og fra ruteplanleggerens auto-vis-lag, slik at faktaboksen er identisk.
 */
export function buildNatureZonePopupHtml(input: NatureZonePopupInput): string {
  const { name, verneform, properties, extraFooterHtml } = input;
  const rule = getVerneformRule(verneform);
  const enrich = enrichNatureArea(properties);
  const status = getStatusPresentation(rule.status);
  const badgeColor = VERNEFORM_BADGE_COLORS[verneform || ''] || rule.color || '#16a34a';
  const esc = escNatureHtml;

  let popup = `<div style="max-width:300px;font-size:12px;line-height:1.45">`;
  popup += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">`;
  popup += `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${badgeColor}"></span>`;
  popup += `<span style="font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.03em">${esc(rule.label)}</span>`;
  popup += `</div>`;
  popup += `<div style="font-weight:600;font-size:13px;margin-bottom:6px">${esc(name || 'Ukjent')}</div>`;

  popup += `<div style="background:${status.bg};border-left:3px solid ${status.border};padding:7px 9px;border-radius:3px;margin-bottom:6px">`;
  popup += `<div style="font-weight:700;color:${status.color};margin-bottom:3px;font-size:12px">${status.icon} ${esc(status.label)}</div>`;
  popup += `<div style="color:#1f2937;margin-bottom:4px">${esc(rule.pilotAdvice)}</div>`;
  popup += `<div style="color:#475569;font-size:11px;border-top:1px solid ${status.border}33;padding-top:4px;margin-top:4px">📄 Åpne faktaarket for verneforskriftens fulle ordlyd</div>`;
  popup += `<div style="color:#64748b;font-size:10px;margin-top:3px">Hjemmel: ${esc(rule.legalBasis)}</div>`;
  popup += `</div>`;

  const metaRows: string[] = [];
  if (enrich.forvaltningsmyndighet) metaRows.push(`<div><strong>Forvaltning:</strong> ${esc(enrich.forvaltningsmyndighet)}</div>`);
  if (enrich.kommune) metaRows.push(`<div><strong>Kommune:</strong> ${esc(enrich.kommune)}</div>`);
  if (enrich.vernedatoFormatted) metaRows.push(`<div><strong>Vernet:</strong> ${esc(enrich.vernedatoFormatted)}</div>`);
  if (enrich.iucn) metaRows.push(`<div><strong>IUCN:</strong> ${esc(enrich.iucn)}</div>`);
  if (metaRows.length) popup += `<div style="margin-bottom:6px;color:#334155">${metaRows.join('')}</div>`;

  const linkStyle = 'display:inline-block;padding:5px 9px;margin:2px 4px 2px 0;background:#0f172a;color:#fff;text-decoration:none;border-radius:4px;font-size:11px;font-weight:500';
  const linkStyleAlt = 'display:inline-block;padding:5px 9px;margin:2px 4px 2px 0;background:#e2e8f0;color:#0f172a;text-decoration:none;border-radius:4px;font-size:11px;font-weight:500';
  popup += `<div style="margin-top:6px">`;
  if (enrich.faktaarkUrl) popup += `<a href="${esc(enrich.faktaarkUrl)}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">📄 Åpne faktaark</a>`;
  if (enrich.dispensasjonUrl) popup += `<a href="${esc(enrich.dispensasjonUrl)}" target="_blank" rel="noopener noreferrer" style="${linkStyleAlt}">📘 ${esc(enrich.dispensasjonLabel)}</a>`;
  if (enrich.sikkerMeldingUrl) popup += `<a href="${esc(enrich.sikkerMeldingUrl)}" target="_blank" rel="noopener noreferrer" style="${linkStyleAlt}">✉️ Send søknad via sikker melding</a>`;
  popup += `<a href="${esc(MILJODIR_DRONE_RULES_URL)}" target="_blank" rel="noopener noreferrer" style="${linkStyleAlt}">ℹ️ Regler for droner</a>`;
  popup += `</div>`;

  if (extraFooterHtml) popup += extraFooterHtml;
  popup += `</div>`;
  return popup;
}



