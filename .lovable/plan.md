## Mål for denne PR-en

Etablere et **trygt i18n-fundament** uten å migrere noe brukerflate-kode ennå. Alle eksisterende `t(...)`-kall, nøkler og filer beholdes uendret. Ingen UI/layout/styling-endringer.

PDF- og AI-migrasjon er **planlagt, men ikke utført her** – det blir egne, små PR-er per modul. Det gjør denne PR-en liten og enkel å reviewe.

## Hva som beholdes urørt

- `i18next` + `react-i18next` + `LanguageDetector` (localStorage).
- Eksisterende `translation`-namespace i `src/i18n/locales/no.json` og `en.json`. Ingen nøkler omdøpes, flyttes eller fjernes.
- `fallbackLng: 'no'` – norsk-først forblir norsk-først.
- `useTerminology`-hooken.
- Språkbytte-knappen i `Header.tsx` (men vi bytter ut en liten inline-utregning mot en helper – ingen visuell endring).

## Hva som legges til (kun fundament)

### 1. Sentralisert språkhjelper
Ny fil `src/lib/i18nHelpers.ts`:
- `getCurrentLanguage(): 'no' | 'en'` – én sannhetskilde, normaliserer `i18n.language`.
- `formatDate(date, opts?)`, `formatNumber(n, opts?)` – bruker locale fra `getCurrentLanguage()`.
- `getFixedT(language, namespace?)` – tynn wrapper rundt `i18n.getFixedT`, brukt **utenfor React** (PDF, exports, varsler). Returnerer typesikker `t`-funksjon.

Begrunnelse: PDF og andre ikke-React-kontekster trenger en stabil måte å hente oversettelser på uten hooks. Den ligger klar når PDF-modulene migreres i senere PR.

### 2. Trygg fallback-policy i `src/i18n/index.ts`
Endrer **kun** init-options (ingen ressursendringer):
- `returnEmptyString: false` – tomme strenger faller tilbake til key/fallback i stedet for å rendre tomt.
- `returnNull: false`.
- `saveMissing: import.meta.env.DEV` med `missingKeyHandler` som `console.warn`-er i dev og er stille i prod.
- Behold `fallbackLng: 'no'`.

Begrunnelse: garanterer at manglende nøkler aldri brekker UI, og gir utviklere synlighet under migrasjon.

### 3. Header bruker helperen
`src/components/Header.tsx`: bytt ut `i18n.language?.startsWith('en') ? 'en' : 'no'`-uttrykkene mot `getCurrentLanguage()`. Ingen visuell endring, ingen endring i knapp/styling/oppførsel.

### 4. Migrasjonsverktøy (kun script + dokumentasjon)
- `scripts/i18n-scan.ts` – Node-script som scanner `src/` for sannsynlig hardkodet norsk (æ/ø/å i strenger/JSX-tekst), grupperer per fil, skriver rapport til `i18n-scan-report.md`. **Ikke** wired inn i build – kjøres manuelt av utvikleren.
- `src/i18n/README.md` – kort guide: namespace-konvensjon for fremtiden, hvordan legge til nytt språk, hvordan velge mellom React-hook og `getFixedT`, hvordan migrere én modul.

### 5. Forberedelse for fremtidige namespaces (kun dokumentert, ingen tomme filer)
README beskriver det planlagte namespace-oppsettet (`pdf`, `ai`, `map`, `sora`, `safety`, `notifications`) som skal opprettes **per modul når den faktisk migreres**, ikke på forhånd. Ingen tomme JSON-filer.

`src/i18n/index.ts` får en kort kommentar som forklarer hvordan nye namespaces registreres når tiden kommer – ingen kode endres for det nå.

## Det som *eksplisitt ikke* gjøres i denne PR-en

- Ingen PDF-tekst migreres (`oppdragPdfExport.ts` m.fl. forblir hardkodet norsk – fungerer som før).
- Ingen edge-functions endres. `ai-search` og andre AI-funksjoner forblir som de er.
- Ingen komponentstrenger flyttes inn i i18n.
- Ingen UI/layout/style/oppførsel-endringer.
- Ingen eksisterende nøkler omdøpes eller flyttes.
- Ingen ESLint-regler aktiveres.
- Ingen tomme placeholder-JSON-filer.

## Anbefalt sekvens for senere PR-er (én av gangen, små)

Hver av disse blir egen PR med kun den modulens nøkler + tekstbytte + verifisering i begge språk:

1. **PDF – `oppdragPdfExport.ts`** først (selvstendig, ingen UI-risiko, klar mal for andre PDF-er via `getFixedT('no'|'en', 'pdf')`).
2. **Edge-function `ai-search`** – legg til `language` i body fra klient, hent prompt fra `supabase/functions/ai-search/prompts/{no,en}.ts`. Bruker ikke frontend-i18n.
3. **`pages/Status.tsx`** (toppen av heatmap, 61 norske strenger, lite forretningsrisiko).
4. **`admin/EmailTemplateEditor.tsx`**.
5. Videre nedover heatmap-lista fra scan-rapporten.

## TypeScript-sjekk

- `i18nHelpers.ts` skrives med strenge typer (`type AppLanguage = 'no' | 'en'`).
- `getFixedT` får generic for namespace.
- Header-endringen er ren refaktor – samme returtyper.

## Output-format ved hver framtidig modul-PR

I PR-beskrivelsen for hver senere modul:
1. Hva ble lagt til (nøkler + filer).
2. Hva ble migrert (strenger + lokasjon).
3. Hva ble bevisst ikke endret.
4. Gjenværende hardkodet tekst i den modulen (med fil/linje).
5. Anbefalt neste modul (basert på scan-rapport).

## Endrede/nye filer i denne PR-en

**Nye**
- `src/lib/i18nHelpers.ts`
- `src/i18n/README.md`
- `scripts/i18n-scan.ts`

**Endret (minimalt)**
- `src/i18n/index.ts` – init-options for fallback/missing-key, kommentar om fremtidige namespaces. Ingen ressursendringer.
- `src/components/Header.tsx` – bruk `getCurrentLanguage()`. Ingen visuell endring.

Det er hele scope.