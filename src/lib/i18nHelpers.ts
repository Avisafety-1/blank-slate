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
export async function setLanguage(lang: AppLanguage): Promise<TFunction> {
  const result = await i18n.changeLanguage(lang);
  // Best-effort: persistér til DB. Feil svelges (offline, RLS, osv.).
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_language: lang })
        .eq('id', user.id);
      if (error) {
        console.warn('[i18n] Could not persist preferred_language to DB:', error.message);
      }
    }
  } catch (err) {
    console.warn('[i18n] preferred_language persist threw:', err);
  }
  return result;
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
