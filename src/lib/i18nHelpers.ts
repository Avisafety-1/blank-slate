/**
 * Sentralisert språkhjelper for i18n.
 *
 * Eneste sannhetskilde for hvilken app-språk som er aktiv. Brukes både i React
 * (via vanlig `useTranslation` der det passer) og utenfor React – f.eks. i
 * PDF-eksport, edge-function-payloads, varslinger, AI-kall – via `getFixedT`.
 *
 * Bevisst minimalistisk: ingen eksisterende komponenter må endres for å ta
 * dette i bruk. Eksisterende `t(...)`-kall via `useTranslation()` virker som før.
 */

import i18n from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import type { TFunction } from "i18next";

export type AppLanguage = "no" | "en";

const SUPPORTED: readonly AppLanguage[] = ["no", "en"] as const;
export const DEFAULT_LANGUAGE: AppLanguage = "no";

/**
 * Returnerer aktivt app-språk, normalisert til en av de støttede kodene.
 * Ukjente språk faller tilbake til {@link DEFAULT_LANGUAGE}.
 */
export function getCurrentLanguage(): AppLanguage {
  const raw = (i18n.language || i18n.resolvedLanguage || DEFAULT_LANGUAGE)
    .toLowerCase()
    .split("-")[0];
  return (SUPPORTED as readonly string[]).includes(raw)
    ? (raw as AppLanguage)
    : DEFAULT_LANGUAGE;
}

/**
 * Bytt aktivt språk programmatisk. Tynn wrapper rundt `i18n.changeLanguage`
 * som validerer input. Persisterer også valget på `profiles.preferred_language`
 * for innlogget bruker (best-effort — feil blokkerer ikke språkbyttet).
 */
export async function setLanguage(
  lang: AppLanguage,
): Promise<{ t: TFunction; persisted: boolean }> {
  const t = await i18n.changeLanguage(lang);
  let persisted = false;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('[i18n] No user — skipped persisting preferred_language');
    } else {
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_language: lang })
        .eq('id', user.id);
      if (error) {
        console.warn('[i18n] Could not persist preferred_language to DB:', error.message);
      } else {
        console.info('[i18n] Persisted preferred_language=', lang);
        persisted = true;
      }
    }
  } catch (err) {
    console.warn('[i18n] preferred_language persist threw:', err);
  }
  return { t, persisted };
}

/**
 * Henter en `t`-funksjon låst til et gitt språk og (valgfritt) namespace.
 * Tenkt for ikke-React kontekster (PDF, eksport, edge-function-payloads).
 *
 * Eksempel:
 *   const t = getFixedT("en", "pdf");
 *   doc.text(t("mission.title"));
 */
export function getFixedT<NS extends string = "translation">(
  language: AppLanguage = getCurrentLanguage(),
  namespace?: NS,
): TFunction<NS> {
  return i18n.getFixedT(language, namespace ?? null) as TFunction<NS>;
}

/**
 * Locale-streng for Intl-API-er. Holder `no` → `nb-NO` (norsk bokmål) for
 * korrekt formatering av tall/datoer.
 */
export function getIntlLocale(language: AppLanguage = getCurrentLanguage()): string {
  return language === "en" ? "en-GB" : "nb-NO";
}

export function formatDate(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
  language: AppLanguage = getCurrentLanguage(),
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(getIntlLocale(language), options).format(date);
}

export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {},
  language: AppLanguage = getCurrentLanguage(),
): string {
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat(getIntlLocale(language), options).format(value);
}

export function translatePersistedRiskText(
  value: string | null | undefined,
  language: AppLanguage = getCurrentLanguage(),
): string {
  if (!value || language !== "en") return value || "";

  return value
    .replace(/Ingen 5 km-soner i nærheten\. Ingen Ninox-godkjenning kreves\./gi, "No 5 km zones nearby. No Ninox approval required.")
    .replace(/Ingen Ninox-godkjenning kreves/gi, "No Ninox approval required")
    .replace(/Ingen 5 km-soner i nærheten/gi, "No 5 km zones nearby")
    .replace(/Oppdraget er innenfor 5 km-sonen rundt/gi, "Mission is inside the 5 km zone around")
    .replace(/Oppdraget er INNENFOR 5 km-sonen rundt/gi, "Mission is INSIDE the 5 km zone around")
    .replace(/Oppdraget er UTENFOR alle 5 km-soner/gi, "Mission is OUTSIDE all 5 km zones")
    .replace(/Oppdraget er UTENFOR 5 km-sonen rundt/gi, "Mission is OUTSIDE the 5 km zone around")
    .replace(/Oppdraget er utenfor 5 km-sonen/gi, "Mission is outside the 5 km zone")
    .replace(/5 km-sonens yttergrense/gi, "5 km zone boundary")
    .replace(/utenfor kontrollert luftrom/gi, "outside controlled airspace")
    .replace(/Utenfor kontrollert luftrom/gi, "Outside controlled airspace")
    .replace(/nærmeste avstand til sonegrense/gi, "nearest distance to zone boundary")
    .replace(/Krever Ninox-godkjenning/gi, "Requires Ninox approval")
    .replace(/krever Ninox-godkjenning/gi, "requires Ninox approval")
    .replace(/Maks 120 m AGL/gi, "Max 120 m AGL")
    .replace(/ved maks 120 m AGL/gi, "at max 120 m AGL")
    .replace(/når flygingen holdes på maks 120 m AGL/gi, "as long as the flight stays at max 120 m AGL")
    .replace(/fra selve flyplassen/gi, "from the airport itself")
    .replace(/rundt «([^»]+)»/g, 'around "$1"')
    .replace(/«([^»]+)»/g, '"$1"');
}

/**
 * Display-only oversettere for verdier som er lagret på norsk i databasen.
 * Endrer ALDRI selve dataverdien — kun visningen. Filtre, joins, sammenligning
 * mot eksisterende rader fungerer som før.
 *
 * Bruksmønster:
 *   <Badge>{translateMissionStatus(mission.status)}</Badge>
 *
 * Returnerer alltid en streng. Ukjente verdier returneres uendret slik at
 * vi aldri ender opp med tomme labels i UI.
 */

type DbValueMap = Record<string, { en: string; no?: string }>;

const MISSION_STATUS: DbValueMap = {
  "Planlagt": { en: "Planned" },
  "Tildelt": { en: "Assigned" },
  "Pågående": { en: "Ongoing" },
  "Pågår": { en: "Ongoing" },
  "Fullført": { en: "Completed" },
  "Avlyst": { en: "Cancelled" },
  "Avbrutt": { en: "Aborted" },
  "Utkast": { en: "Draft" },
};

const APPROVAL_STATUS: DbValueMap = {
  "approved": { en: "Approved", no: "Godkjent" },
  "pending_approval": { en: "Pending approval", no: "Venter på godkjenning" },
  "not_approved": { en: "Not approved", no: "Ikke godkjent" },
  "rejected": { en: "Rejected", no: "Avvist" },
};

const APPROVAL_STATUS_COMPACT: DbValueMap = {
  "approved": { en: "Approved", no: "Godkjent" },
  "pending_approval": { en: "Pending", no: "Venter" },
  "not_approved": { en: "Not approved", no: "Ikke godkjent" },
  "rejected": { en: "Rejected", no: "Avvist" },
};

const INCIDENT_STATUS: DbValueMap = {
  "Åpen": { en: "Open" },
  "Under behandling": { en: "In progress" },
  "Under utredning": { en: "Under investigation" },
  "Tiltak iverksatt": { en: "Action taken" },
  "Ferdigbehandlet": { en: "Resolved" },
  "Ny": { en: "New" },
  "Løst": { en: "Resolved" },
  "Lukket": { en: "Closed" },
  "Pågår": { en: "In progress" },
  "Utført": { en: "Done" },
  "Forsinket": { en: "Delayed" },
};

const SEVERITY: DbValueMap = {
  "Lav": { en: "Low" },
  "Middels": { en: "Medium" },
  "Høy": { en: "High" },
  "Kritisk": { en: "Critical" },
};

const INCIDENT_CATEGORY: DbValueMap = {
  "Uønsket hendelse": { en: "Unwanted event" },
  "Avvik": { en: "Non-conformance" },
  "Nestenulykke": { en: "Near miss" },
  "Observasjon": { en: "Observation" },
  "Luft": { en: "Air" },
  "Bakke": { en: "Ground" },
  "Luftrom": { en: "Airspace" },
  "Teknisk": { en: "Technical" },
  "Operativ": { en: "Operational" },
  "Miljø": { en: "Environment" },
  "Sikkerhet": { en: "Security" },
};

const DOC_CATEGORY: DbValueMap = {
  "Prosedyrer": { en: "Procedures" },
  "Sjekklister": { en: "Checklists" },
  "Manualer": { en: "Manuals" },
  "Sertifikater": { en: "Certificates" },
  "Annet": { en: "Other" },
};

const SORA_STATUS: DbValueMap = {
  "Ikke startet": { en: "Not started" },
  "Under arbeid": { en: "In progress" },
  "Pågår": { en: "In progress" },
  "Revidert": { en: "Revised" },
  "Ferdig": { en: "Done" },
};

const AI_RISK_RECOMMENDATION: DbValueMap = {
  "proceed": { en: "Recommended", no: "Anbefalt" },
  "go": { en: "Recommended", no: "Anbefalt" },
  "proceed_with_caution": { en: "Caution", no: "Forsiktighet" },
  "caution": { en: "Caution", no: "Forsiktighet" },
  "not_recommended": { en: "Not recommended", no: "Ikke anbefalt" },
  "no-go": { en: "Not recommended", no: "Ikke anbefalt" },
};

const ROOT_CAUSE: DbValueMap = {
  "Menneskelig feil": { en: "Human error" },
  "Teknisk feil": { en: "Technical failure" },
  "Værforhold": { en: "Weather conditions" },
  "Organisatorisk": { en: "Organisational" },
  "Prosedyresvikt": { en: "Procedural failure" },
  "Ytre påvirkning": { en: "External influence" },
  "Annet": { en: "Other" },
  "Ukjent": { en: "Unknown" },
};

function lookup(
  map: DbValueMap,
  value: string | null | undefined,
  language: AppLanguage,
): string {
  if (value == null) return "";
  const entry = map[value] ?? map[value.toLowerCase?.() ?? value];
  if (!entry) return value;
  if (language === "en") return entry.en;
  return entry.no ?? value;
}

export const translateMissionStatus = (v: string | null | undefined, lang: AppLanguage = getCurrentLanguage()) =>
  lookup(MISSION_STATUS, v, lang);

export const translateApprovalStatus = (
  v: string | null | undefined,
  opts: { compact?: boolean } = {},
  lang: AppLanguage = getCurrentLanguage(),
) => lookup(opts.compact ? APPROVAL_STATUS_COMPACT : APPROVAL_STATUS, v ?? "not_approved", lang);

export const translateIncidentStatus = (v: string | null | undefined, lang: AppLanguage = getCurrentLanguage()) =>
  lookup(INCIDENT_STATUS, v, lang);

export const translateSeverity = (v: string | null | undefined, lang: AppLanguage = getCurrentLanguage()) =>
  lookup(SEVERITY, v, lang);

export const translateIncidentCategory = (v: string | null | undefined, lang: AppLanguage = getCurrentLanguage()) =>
  lookup(INCIDENT_CATEGORY, v, lang);

export const translateDocCategory = (v: string | null | undefined, lang: AppLanguage = getCurrentLanguage()) =>
  lookup(DOC_CATEGORY, v, lang);

export const translateSoraStatus = (v: string | null | undefined, lang: AppLanguage = getCurrentLanguage()) =>
  lookup(SORA_STATUS, v, lang);

export const translateAIRiskRecommendation = (v: string | null | undefined, lang: AppLanguage = getCurrentLanguage()) =>
  lookup(AI_RISK_RECOMMENDATION, v?.toLowerCase(), lang) || v || "";

export const translateRootCause = (v: string | null | undefined, lang: AppLanguage = getCurrentLanguage()) =>
  lookup(ROOT_CAUSE, v, lang);
