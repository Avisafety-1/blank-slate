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

import i18n from '@/i18n';
const tp = (k: string, opts?: any): string => i18n.t(`safety.natureProtection.${k}`, opts) as string;

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
const VERNEFORM_RULE_META: Record<string, VerneformRule> = {
  Nasjonalpark: {
    label: tp('rules.Nasjonalpark.label'),
    rule: 'Droneflyging er som hovedregel forbudt. Krever dispensasjon fra forvaltningsmyndigheten.',
    legalBasis: tp('rules.Nasjonalpark.legalBasis'),
    color: '#15803d',
    status: 'FORBUDT',
    pilotAdvice: tp('rules.Nasjonalpark.pilotAdvice'),
  },
  NasjonalparkSvalbard: {
    label: tp('rules.NasjonalparkSvalbard.label'),
    rule: 'Droneflyging er forbudt uten tillatelse fra Sysselmesteren.',
    legalBasis: tp('rules.NasjonalparkSvalbard.legalBasis'),
    color: '#15803d',
    status: 'FORBUDT',
    pilotAdvice: tp('rules.NasjonalparkSvalbard.pilotAdvice'),
  },
  Naturreservat: {
    label: tp('rules.Naturreservat.label'),
    rule: 'Droneflyging er normalt forbudt. Krever dispensasjon fra forvaltningsmyndigheten.',
    legalBasis: tp('rules.Naturreservat.legalBasis'),
    color: '#166534',
    status: 'SJEKK_FORSKRIFT',
    pilotAdvice: tp('rules.Naturreservat.pilotAdvice'),
  },
  NaturreservatSvalbard: {
    label: tp('rules.NaturreservatSvalbard.label'),
    rule: 'Droneflyging er forbudt uten tillatelse fra Sysselmesteren.',
    legalBasis: tp('rules.NaturreservatSvalbard.legalBasis'),
    color: '#166534',
    status: 'FORBUDT',
    pilotAdvice: tp('rules.NaturreservatSvalbard.pilotAdvice'),
  },
  NaturreservatJanMayen: {
    label: tp('rules.NaturreservatJanMayen.label'),
    rule: 'Droneflyging er forbudt uten særskilt tillatelse.',
    legalBasis: tp('rules.NaturreservatJanMayen.legalBasis'),
    color: '#166534',
    status: 'FORBUDT',
    pilotAdvice: tp('rules.NaturreservatJanMayen.pilotAdvice'),
  },
  Landskapsvernomraade: {
    label: tp('rules.Landskapsvernomraade.label'),
    rule: 'Droneflyging er ofte begrenset og kan kreve dispensasjon. Sjekk verneforskriften.',
    legalBasis: tp('rules.Landskapsvernomraade.legalBasis'),
    color: '#4ade80',
    status: 'SJEKK_FORSKRIFT',
    pilotAdvice: tp('rules.Landskapsvernomraade.pilotAdvice'),
  },
  LandskapsvernomraadeDyrelivsfredning: {
    label: tp('rules.LandskapsvernomraadeDyrelivsfredning.label'),
    rule: 'Droneflyging er begrenset, særlig i hekkesesongen. Krever ofte dispensasjon.',
    legalBasis: tp('rules.LandskapsvernomraadeDyrelivsfredning.legalBasis'),
    color: '#4ade80',
    status: 'BEGRENSET',
    pilotAdvice: tp('rules.LandskapsvernomraadeDyrelivsfredning.pilotAdvice'),
  },
  LandskapsvernomraadePlantelivsfredning: {
    label: tp('rules.LandskapsvernomraadePlantelivsfredning.label'),
    rule: 'Droneflyging er begrenset. Sjekk verneforskriften.',
    legalBasis: tp('rules.LandskapsvernomraadePlantelivsfredning.legalBasis'),
    color: '#4ade80',
    status: 'SJEKK_FORSKRIFT',
    pilotAdvice: tp('rules.LandskapsvernomraadePlantelivsfredning.pilotAdvice'),
  },
  LandskapsvernomraadePlanteOgDyrelivsfredning: {
    label: tp('rules.LandskapsvernomraadePlanteOgDyrelivsfredning.label'),
    rule: 'Droneflyging er begrenset, særlig i hekkesesongen. Krever ofte dispensasjon.',
    legalBasis: tp('rules.LandskapsvernomraadePlanteOgDyrelivsfredning.legalBasis'),
    color: '#4ade80',
    status: 'BEGRENSET',
    pilotAdvice: tp('rules.LandskapsvernomraadePlanteOgDyrelivsfredning.pilotAdvice'),
  },
  LandskapsvernomraadeBiotopvern: {
    label: tp('rules.LandskapsvernomraadeBiotopvern.label'),
    rule: 'Droneflyging er begrenset. Krever ofte dispensasjon.',
    legalBasis: tp('rules.LandskapsvernomraadeBiotopvern.legalBasis'),
    color: '#4ade80',
    status: 'BEGRENSET',
    pilotAdvice: tp('rules.LandskapsvernomraadeBiotopvern.pilotAdvice'),
  },
  Biotopvern: {
    label: tp('rules.Biotopvern.label'),
    rule: 'Droneflyging er forbudt eller sterkt begrenset, særlig i hekke-/yngletid.',
    legalBasis: tp('rules.Biotopvern.legalBasis'),
    color: '#22c55e',
    status: 'BEGRENSET',
    pilotAdvice: tp('rules.Biotopvern.pilotAdvice'),
  },
  BiotopvernVilt: {
    label: tp('rules.BiotopvernVilt.label'),
    rule: 'Droneflyging er forbudt eller sterkt begrenset, særlig i hekke-/yngletid.',
    legalBasis: tp('rules.BiotopvernVilt.legalBasis'),
    color: '#22c55e',
    status: 'BEGRENSET',
    pilotAdvice: tp('rules.BiotopvernVilt.pilotAdvice'),
  },
  MarintVerneomraade: {
    label: tp('rules.MarintVerneomraade.label'),
    rule: 'Ingen egne droneregler, men sjekk nærliggende verneområder.',
    legalBasis: tp('rules.MarintVerneomraade.legalBasis'),
    color: '#0ea5e9',
    status: 'AKTSOMHET',
    pilotAdvice: tp('rules.MarintVerneomraade.pilotAdvice'),
  },
  Dyrefredningsomrade: {
    label: tp('rules.Dyrefredningsomrade.label'),
    rule: 'Droneflyging er som hovedregel forbudt i hekke-/yngletid. Krever dispensasjon.',
    legalBasis: tp('rules.Dyrefredningsomrade.legalBasis'),
    color: '#a3e635',
    status: 'BEGRENSET',
    pilotAdvice: tp('rules.Dyrefredningsomrade.pilotAdvice'),
  },
  Dyrelivsfredning: {
    label: tp('rules.Dyrelivsfredning.label'),
    rule: 'Droneflyging er begrenset, særlig i hekke-/yngletid.',
    legalBasis: tp('rules.Dyrelivsfredning.legalBasis'),
    color: '#a3e635',
    status: 'BEGRENSET',
    pilotAdvice: tp('rules.Dyrelivsfredning.pilotAdvice'),
  },
  Plantefredningsomraade: {
    label: tp('rules.Plantefredningsomraade.label'),
    rule: 'Landing og oppstart er ofte forbudt. Overflyging kan være tillatt.',
    legalBasis: tp('rules.Plantefredningsomraade.legalBasis'),
    color: '#84cc16',
    status: 'SJEKK_FORSKRIFT',
    pilotAdvice: tp('rules.Plantefredningsomraade.pilotAdvice'),
  },
  Plantelivsfredning: {
    label: tp('rules.Plantelivsfredning.label'),
    rule: 'Landing og oppstart er ofte forbudt. Sjekk verneforskriften.',
    legalBasis: tp('rules.Plantelivsfredning.legalBasis'),
    color: '#84cc16',
    status: 'SJEKK_FORSKRIFT',
    pilotAdvice: tp('rules.Plantelivsfredning.pilotAdvice'),
  },
  PlanteOgDyrefredningsomraade: {
    label: tp('rules.PlanteOgDyrefredningsomraade.label'),
    rule: 'Droneflyging er begrenset, særlig i hekke-/yngletid. Krever ofte dispensasjon.',
    legalBasis: tp('rules.PlanteOgDyrefredningsomraade.legalBasis'),
    color: '#a3e635',
    status: 'BEGRENSET',
    pilotAdvice: tp('rules.PlanteOgDyrefredningsomraade.pilotAdvice'),
  },
  PlanteOgDyrelivsfredning: {
    label: tp('rules.PlanteOgDyrelivsfredning.label'),
    rule: 'Droneflyging er begrenset, særlig i hekke-/yngletid.',
    legalBasis: tp('rules.PlanteOgDyrelivsfredning.legalBasis'),
    color: '#a3e635',
    status: 'BEGRENSET',
    pilotAdvice: tp('rules.PlanteOgDyrelivsfredning.pilotAdvice'),
  },
  Naturminne: {
    label: tp('rules.Naturminne.label'),
    rule: 'Området er fredet — sjekk verneforskriften før droneflyging.',
    legalBasis: tp('rules.Naturminne.legalBasis'),
    color: '#16a34a',
    status: 'SJEKK_FORSKRIFT',
    pilotAdvice: tp('rules.Naturminne.pilotAdvice'),
  },
  GeotopvernSvalbard: {
    label: tp('rules.GeotopvernSvalbard.label'),
    rule: 'Droneflyging krever tillatelse fra Sysselmesteren.',
    legalBasis: tp('rules.GeotopvernSvalbard.legalBasis'),
    color: '#16a34a',
    status: 'FORBUDT',
    pilotAdvice: tp('rules.GeotopvernSvalbard.pilotAdvice'),
  },
  MidlertidigVernaOmraade: {
    label: tp('rules.MidlertidigVernaOmraade.label'),
    rule: 'Området har midlertidig vern — antas å ha samme restriksjoner som tilsvarende permanente vern.',
    legalBasis: tp('rules.MidlertidigVernaOmraade.legalBasis'),
    color: '#16a34a',
    status: 'SJEKK_FORSKRIFT',
    pilotAdvice: tp('rules.MidlertidigVernaOmraade.pilotAdvice'),
  },
};

function DEFAULT_RULE(): VerneformRule {
  return {
    label: tp('defaultRule.label'),
    rule: tp('defaultRule.pilotAdvice'),
    legalBasis: tp('defaultRule.legalBasis'),
    color: '#16a34a',
    status: 'SJEKK_FORSKRIFT',
    pilotAdvice: tp('defaultRule.pilotAdvice'),
  };
}

export function getVerneformRule(verneform: string | null | undefined): VerneformRule {
  const meta = verneform ? VERNEFORM_RULE_META[verneform] : undefined;
  return meta ?? DEFAULT_RULE();
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
    return { url: SYSSELMESTER_URL, label: tp('dispensasjon.sysselmester'), sikkerMeldingUrl: null };
  }
  if (
    t.includes('verneomraadestyre') ||
    t.includes('nasjonalparkstyre') ||
    m.includes('verneområdestyre') ||
    m.includes('nasjonalparkstyre')
  ) {
    return {
      url: forvaltningsmyndighet ? nasjonalparkstyreUrl(forvaltningsmyndighet) : NASJONALPARKSTYRE_BASE,
      label: forvaltningsmyndighet ? tp('dispensasjon.veiledningHosAuthority', { authority: forvaltningsmyndighet }) : tp('dispensasjon.veiledningHosVerneomraadestyret'),
      sikkerMeldingUrl: null,
    };
  }
  if (t.includes('statsforvalter') || m.includes('statsforvalteren')) {
    return {
      url: forvaltningsmyndighet ? statsforvalterVerneUrl(forvaltningsmyndighet) : STATSFORVALTER_FALLBACK,
      label: forvaltningsmyndighet ? tp('dispensasjon.veiledningHosAuthority', { authority: forvaltningsmyndighet }) : tp('dispensasjon.veiledningHosStatsforvalteren'),
      sikkerMeldingUrl: STATSFORVALTER_SIKKER_MELDING,
    };
  }
  if (t.includes('kommune') || m.includes(' kommune')) {
    return {
      url: faktaarkUrl,
      label: forvaltningsmyndighet ? tp('dispensasjon.kontaktMed', { authority: forvaltningsmyndighet }) : tp('dispensasjon.kontaktForvaltningsmyndighet'),
      sikkerMeldingUrl: null,
    };
  }
  return { url: STATSFORVALTER_FALLBACK, label: tp('dispensasjon.veiledningHosStatsforvalteren'), sikkerMeldingUrl: null };
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
  popup += `<div style="font-weight:600;font-size:13px;margin-bottom:6px">${esc(name || tp('unknownName'))}</div>`;

  popup += `<div style="background:${status.bg};border-left:3px solid ${status.border};padding:7px 9px;border-radius:3px;margin-bottom:6px">`;
  popup += `<div style="font-weight:700;color:${status.color};margin-bottom:3px;font-size:12px">${status.icon} ${esc(status.label)}</div>`;
  popup += `<div style="color:#1f2937;margin-bottom:4px">${esc(rule.pilotAdvice)}</div>`;
  popup += `<div style="color:#475569;font-size:11px;border-top:1px solid ${status.border}33;padding-top:4px;margin-top:4px">${tp('factSheetNote')}</div>`;
  popup += `<div style="color:#64748b;font-size:10px;margin-top:3px">${tp('legalBasis', { basis: rule.legalBasis })}</div>`;
  popup += `</div>`;

  const metaRows: string[] = [];
  if (enrich.forvaltningsmyndighet) metaRows.push(`<div><strong>${tp('metaForvaltning')}</strong> ${esc(enrich.forvaltningsmyndighet)}</div>`);
  if (enrich.kommune) metaRows.push(`<div><strong>${tp('metaKommune')}</strong> ${esc(enrich.kommune)}</div>`);
  if (enrich.vernedatoFormatted) metaRows.push(`<div><strong>${tp('metaVernet')}</strong> ${esc(enrich.vernedatoFormatted)}</div>`);
  if (enrich.iucn) metaRows.push(`<div><strong>${tp('metaIucn')}</strong> ${esc(enrich.iucn)}</div>`);
  if (metaRows.length) popup += `<div style="margin-bottom:6px;color:#334155">${metaRows.join('')}</div>`;

  const linkStyle = 'display:inline-block;padding:5px 9px;margin:2px 4px 2px 0;background:#0f172a;color:#fff;text-decoration:none;border-radius:4px;font-size:11px;font-weight:500';
  const linkStyleAlt = 'display:inline-block;padding:5px 9px;margin:2px 4px 2px 0;background:#e2e8f0;color:#0f172a;text-decoration:none;border-radius:4px;font-size:11px;font-weight:500';
  popup += `<div style="margin-top:6px">`;
  if (enrich.faktaarkUrl) popup += `<a href="${esc(enrich.faktaarkUrl)}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">${tp('linkFactSheet')}</a>`;
  if (enrich.dispensasjonUrl) popup += `<a href="${esc(enrich.dispensasjonUrl)}" target="_blank" rel="noopener noreferrer" style="${linkStyleAlt}">${esc(tp('linkGuidance', { label: enrich.dispensasjonLabel }))}</a>`;
  if (enrich.sikkerMeldingUrl) popup += `<a href="${esc(enrich.sikkerMeldingUrl)}" target="_blank" rel="noopener noreferrer" style="${linkStyleAlt}">${tp('linkSecureMessage')}</a>`;
  popup += `<a href="${esc(MILJODIR_DRONE_RULES_URL)}" target="_blank" rel="noopener noreferrer" style="${linkStyleAlt}">${tp('linkDroneRules')}</a>`;
  popup += `</div>`;

  if (extraFooterHtml) popup += extraFooterHtml;
  popup += `</div>`;
  return popup;
}



