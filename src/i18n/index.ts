import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import no from './locales/no.json';
import en from './locales/en.json';
import noPdf from './locales/no/pdf.json';
import enPdf from './locales/en/pdf.json';

/**
 * i18n-oppsett.
 *
 * Eksisterende `translation`-namespace er bevisst beholdt urørt. Alle nåværende
 * `t('missions.create')`-kall fortsetter å virke uten endringer.
 *
 * Når en modul migreres fra hardkodet tekst til i18n bør den enten:
 *   1. Legge nye nøkler under et eksisterende toppnivå i `translation` (raskt,
 *      egnet for små moduler), eller
 *   2. Få et eget namespace (anbefalt for store moduler som PDF, AI, kart, SORA).
 *      For å registrere et nytt namespace:
 *        - lag `src/i18n/locales/<lang>/<namespace>.json`
 *        - importer her og legg det inn under `resources[<lang>][<namespace>]`
 *        - bruk det med `useTranslation('<namespace>')` eller
 *          `getFixedT(lang, '<namespace>')` for kontekster utenfor React.
 * Se `src/i18n/README.md` for detaljer.
 */
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      no: { translation: no, pdf: noPdf },
      en: { translation: en, pdf: enPdf },
    },
    ns: ['translation', 'pdf'],
    defaultNS: 'translation',
    fallbackLng: 'no',
    // Aldri returner null/tom streng – vi vil ha synlig nøkkel-fallback i stedet
    // for tomme områder i UI dersom en oversettelse mangler.
    returnNull: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: (lngs, ns, key) => {
      if (import.meta.env.DEV) {
        // Stille i prod; synlig advarsel i dev så utviklere oppdager
        // manglende nøkler under migrasjon.
        // eslint-disable-next-line no-console
        console.warn(`[i18n] Mangler nøkkel "${key}" i ns="${ns}" for [${lngs.join(',')}]`);
      }
    },
  });

export default i18n;
