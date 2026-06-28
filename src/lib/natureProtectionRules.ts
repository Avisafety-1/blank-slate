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

export interface VerneformRule {
  /** Visningsnavn på norsk (æøå). */
  label: string;
  /** Kort hovedregel for droneflyging. */
  rule: string;
  /** Lovhjemmel-referanse i klartekst (ingen Lovdata-URL). */
  legalBasis: string;
  /** Farge for badge — matcher eksisterende verneformColors. */
  color: string;
}

/**
 * Sentralt regelsett per `verneform`-verdi fra Naturbase.
 * Nøklene matcher rå-verdier i DB (uten æøå for noen, jf. Naturbase-skjema).
 */
export const VERNEFORM_RULES: Record<string, VerneformRule> = {
  Nasjonalpark: {
    label: 'Nasjonalpark',
    rule: 'Droneflyging er som hovedregel forbudt. Krever dispensasjon fra forvaltningsmyndigheten.',
    legalBasis: 'Naturmangfoldloven § 35 og verneforskriften for området.',
    color: '#15803d',
  },
  NasjonalparkSvalbard: {
    label: 'Nasjonalpark (Svalbard)',
    rule: 'Droneflyging er forbudt uten tillatelse fra Sysselmesteren.',
    legalBasis: 'Svalbardmiljøloven og verneforskriften.',
    color: '#15803d',
  },
  Naturreservat: {
    label: 'Naturreservat',
    rule: 'Droneflyging er normalt forbudt. Krever dispensasjon fra forvaltningsmyndigheten.',
    legalBasis: 'Naturmangfoldloven § 37 og verneforskriften for området.',
    color: '#166534',
  },
  NaturreservatSvalbard: {
    label: 'Naturreservat (Svalbard)',
    rule: 'Droneflyging er forbudt uten tillatelse fra Sysselmesteren.',
    legalBasis: 'Svalbardmiljøloven og verneforskriften.',
    color: '#166534',
  },
  NaturreservatJanMayen: {
    label: 'Naturreservat (Jan Mayen)',
    rule: 'Droneflyging er forbudt uten særskilt tillatelse.',
    legalBasis: 'Verneforskrift for Jan Mayen.',
    color: '#166534',
  },
  Landskapsvernomraade: {
    label: 'Landskapsvernområde',
    rule: 'Droneflyging er ofte begrenset og kan kreve dispensasjon. Sjekk verneforskriften.',
    legalBasis: 'Naturmangfoldloven § 36 og verneforskriften for området.',
    color: '#4ade80',
  },
  LandskapsvernomraadeDyrelivsfredning: {
    label: 'Landskapsvernområde med dyrelivsfredning',
    rule: 'Droneflyging er begrenset, særlig i hekkesesongen. Krever ofte dispensasjon.',
    legalBasis: 'Naturmangfoldloven § 36 og verneforskriften.',
    color: '#4ade80',
  },
  LandskapsvernomraadePlantelivsfredning: {
    label: 'Landskapsvernområde med plantelivsfredning',
    rule: 'Droneflyging er begrenset. Sjekk verneforskriften.',
    legalBasis: 'Naturmangfoldloven § 36 og verneforskriften.',
    color: '#4ade80',
  },
  LandskapsvernomraadePlanteOgDyrelivsfredning: {
    label: 'Landskapsvernområde med plante- og dyrelivsfredning',
    rule: 'Droneflyging er begrenset, særlig i hekkesesongen. Krever ofte dispensasjon.',
    legalBasis: 'Naturmangfoldloven § 36 og verneforskriften.',
    color: '#4ade80',
  },
  LandskapsvernomraadeBiotopvern: {
    label: 'Landskapsvernområde med biotopvern',
    rule: 'Droneflyging er begrenset. Krever ofte dispensasjon.',
    legalBasis: 'Naturmangfoldloven § 36 og verneforskriften.',
    color: '#4ade80',
  },
  Biotopvern: {
    label: 'Biotopvernområde',
    rule: 'Droneflyging er forbudt eller sterkt begrenset, særlig i hekke-/yngletid.',
    legalBasis: 'Naturmangfoldloven § 38 og verneforskriften.',
    color: '#22c55e',
  },
  BiotopvernVilt: {
    label: 'Biotopvernområde (vilt)',
    rule: 'Droneflyging er forbudt eller sterkt begrenset, særlig i hekke-/yngletid.',
    legalBasis: 'Viltloven § 7 og verneforskriften.',
    color: '#22c55e',
  },
  MarintVerneomraade: {
    label: 'Marint verneområde',
    rule: 'Droneflyging kan være begrenset over hekkekolonier og marine fuglearter. Sjekk verneforskriften.',
    legalBasis: 'Naturmangfoldloven § 39 og verneforskriften.',
    color: '#0ea5e9',
  },
  Dyrefredningsomrade: {
    label: 'Dyrefredningsområde',
    rule: 'Droneflyging er som hovedregel forbudt i hekke-/yngletid. Krever dispensasjon.',
    legalBasis: 'Naturmangfoldloven og verneforskriften.',
    color: '#a3e635',
  },
  Dyrelivsfredning: {
    label: 'Dyrelivsfredning',
    rule: 'Droneflyging er begrenset, særlig i hekke-/yngletid.',
    legalBasis: 'Naturmangfoldloven og verneforskriften.',
    color: '#a3e635',
  },
  Plantefredningsomraade: {
    label: 'Plantefredningsområde',
    rule: 'Landing og oppstart er ofte forbudt. Overflyging kan være tillatt — sjekk verneforskriften.',
    legalBasis: 'Naturmangfoldloven og verneforskriften.',
    color: '#84cc16',
  },
  Plantelivsfredning: {
    label: 'Plantelivsfredning',
    rule: 'Landing og oppstart er ofte forbudt. Sjekk verneforskriften.',
    legalBasis: 'Naturmangfoldloven og verneforskriften.',
    color: '#84cc16',
  },
  PlanteOgDyrefredningsomraade: {
    label: 'Plante- og dyrefredningsområde',
    rule: 'Droneflyging er begrenset, særlig i hekke-/yngletid. Krever ofte dispensasjon.',
    legalBasis: 'Naturmangfoldloven og verneforskriften.',
    color: '#a3e635',
  },
  PlanteOgDyrelivsfredning: {
    label: 'Plante- og dyrelivsfredning',
    rule: 'Droneflyging er begrenset, særlig i hekke-/yngletid.',
    legalBasis: 'Naturmangfoldloven og verneforskriften.',
    color: '#a3e635',
  },
  Naturminne: {
    label: 'Naturminne',
    rule: 'Området er fredet — sjekk verneforskriften før droneflyging.',
    legalBasis: 'Naturmangfoldloven og verneforskriften.',
    color: '#16a34a',
  },
  GeotopvernSvalbard: {
    label: 'Geotopvern (Svalbard)',
    rule: 'Droneflyging krever tillatelse fra Sysselmesteren.',
    legalBasis: 'Svalbardmiljøloven.',
    color: '#16a34a',
  },
  MidlertidigVernaOmraade: {
    label: 'Midlertidig vernet område',
    rule: 'Området har midlertidig vern — antas å ha samme restriksjoner som tilsvarende permanente vern.',
    legalBasis: 'Naturmangfoldloven § 45.',
    color: '#16a34a',
  },
};

const DEFAULT_RULE: VerneformRule = {
  label: 'Naturvernområde',
  rule: 'Droneflyging kan være begrenset. Sjekk verneforskriften før flyging.',
  legalBasis: 'Naturmangfoldloven og verneforskriften for området.',
  color: '#16a34a',
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
  /** URL til søknad om dispensasjon — bygges fra myndighet hvis kjent. */
  dispensasjonUrl: string | null;
  /** Generisk telefon/e-post utledet fra myndighet (kun for nasjonalparkstyre/sysselmester). */
  kontaktTlf: string | null;
  kontaktEpost: string | null;
}

/**
 * Statsforvalter-domener for søknad om dispensasjon.
 * Mappingen er konservativ og brukes som «mer info»-lenke.
 */
const STATSFORVALTER_URL = 'https://www.statsforvalteren.no/';

/**
 * Nasjonalparkstyre / verneområdestyre har sine forvaltningsplaner publisert
 * på nasjonalparkstyre.no. Vi lenker til hovedsiden — bruker finner sitt
 * styre derfra. Mer presis mapping kan legges til senere.
 */
const NASJONALPARKSTYRE_URL = 'https://www.nasjonalparkstyre.no/';

const SYSSELMESTER_URL = 'https://www.sysselmesteren.no/';

function formatVernedato(value: unknown): string | null {
  if (value == null) return null;
  const ms = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function dispensasjonUrlFor(forvaltningsmyndighet: string | null, type: string | null): string | null {
  if (!forvaltningsmyndighet && !type) return null;
  const t = (type || '').toLowerCase();
  const m = (forvaltningsmyndighet || '').toLowerCase();
  if (t.includes('sysselmester') || m.includes('sysselmester')) return SYSSELMESTER_URL;
  if (t.includes('nasjonalparkstyre') || m.includes('nasjonalparkstyre') || m.includes('verneområdestyre')) {
    return NASJONALPARKSTYRE_URL;
  }
  if (t.includes('statsforvalter') || m.includes('statsforvalteren')) return STATSFORVALTER_URL;
  return null;
}

export function enrichNatureArea(properties: Record<string, any> | null | undefined): NatureAreaEnrichment {
  const p = properties || {};
  const naturvernId: string | null = p.naturvernId || null;
  const faktaarkFromProps: string | null = typeof p.faktaark === 'string' ? p.faktaark : null;
  const faktaarkUrl = faktaarkFromProps
    || (naturvernId ? `https://faktaark.naturbase.no/?id=${encodeURIComponent(naturvernId)}` : null);

  const forvaltningsmyndighet: string | null = p.forvaltningsmyndighet || null;
  const forvaltningsmyndighetType: string | null = p.forvaltningsmyndighetType || null;

  return {
    faktaarkUrl,
    forvaltningsmyndighet,
    forvaltningsmyndighetType,
    vernedatoFormatted: formatVernedato(p.vernedato),
    iucn: typeof p.iucn === 'string' ? p.iucn.replace(/^IUCN_/, '') : null,
    kommune: p.kommune || null,
    verneplan: p.verneplan || null,
    dispensasjonUrl: dispensasjonUrlFor(forvaltningsmyndighet, forvaltningsmyndighetType),
    // Kontakt-info ligger ikke i Naturbase. Lenker fungerer som inngang.
    kontaktTlf: null,
    kontaktEpost: null,
  };
}
