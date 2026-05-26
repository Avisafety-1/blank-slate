## Problem

Skjermbildet bekrefter at UI-en din står på engelsk, men AI-en svarer på norsk. Roten til problemet er ikke `getCurrentLanguage()` — det er kombinasjonen av:

1. **Inn-data er på norsk.** `contextData` som sendes til modellen inneholder norsk tekst fra Met.no, luftromsanalyse, SORA-config osv. (f.eks. `"text":"Ingen 5 km-soner i nærheten"`). Gemini speiler språket i input-dataene.
2. **Språkdirektivet i prompten er for svakt.** EN-prompten har kun én linje på slutten: *"Always respond in English."* Den blir overdøvet av all norsken modellen leser.
3. **Vi har enda ikke bekreftet** at klienten faktisk sender `language: "en"` til edge-funksjonen — den nye debug-loggen min har ikke dukket opp i edge-loggene ennå, sannsynligvis fordi det første fetch-kallet (linje 155 — SORA-reassessment) ikke har logging, og det er det som ble brukt.

## Plan

### 1. Bekreft hva som faktisk sendes
- Legg til samme `console.log` på det første fetch-kallet i `RiskAssessmentDialog.tsx` (linje 142–158) som det jeg allerede la til på det andre kallet.
- Behold edge-function-loggen som allerede er der.

### 2. Forsterk språkdirektivet i selve user-prompten
I `supabase/functions/ai-risk-assessment/prompts.ts`:

- **`buildUserPromptEN`** — bytt åpningslinjen til en hard instruks som står BÅDE først og sist:
  > "CRITICAL LANGUAGE INSTRUCTION: Respond ENTIRELY in English. The input data below contains Norwegian text from Norwegian data sources (Met.no, airspace zones, SORA config). Translate or paraphrase any Norwegian terms into English in your output. Do NOT mirror the language of the input."
- **`buildUserPromptNO`** — speilvend: instruks om at ALL output må være på norsk (modellen blander noen ganger inn engelske SORA-termer på norske kjøringer også).
- I tillegg legg samme tospråk-direktiv øverst i system-prompten (`buildSystemPromptEN` / `buildSystemPromptNO`) som en numerisk regel #0 før resten.

### 3. Oversett gjenstående UI-strenger i resultatvisningen
Konsollen og skjermbildet viser at disse UI-labels mangler oversettelse:
- `riskAssessment.skipWeather`, `riskAssessment.saveComments`, `riskAssessment.addComment`, `riskAssessment.prerequisites`, `riskAssessment.weatherOptions`
- "SORA utført"-pillen (hardkodet norsk i `RiskScoreCard.tsx` eller `RiskAssessmentDialog.tsx`)

Legg til norske + engelske oversettelser i `src/i18n/locales/no.json` og `en.json` under `riskAssessment.*`, og bytt ut den hardkodede "SORA utført"-strengen med `t('riskAssessment.soraCompleted')`.

### 4. Verifiser
- Be deg kjøre en ny vurdering på engelsk UI.
- Sjekk:
  - Browser-konsoll: `[RiskAssessment] Sending language to AI: en`
  - Edge-logg: `[ai-risk-assessment] Received language: "en" -> resolved: en`
  - AI-summary kommer på engelsk
- Når bekreftet OK: fjern de to `console.log`-debuggene.

## Technical notes

- Vi rører ikke `getCurrentLanguage()` — den fungerer.
- Vi rører ikke modellvalget — Gemini 3 Flash er kapabel nok, problemet er prompt-engineering.
- De manglende-nøkkel-varslene `for [no]` i konsollen er et i18next-artefakt (`saveMissingTo: 'fallback'` rapporterer fallback-språket, ikke aktivt språk) — bekreftet av skjermbildet at UI faktisk er engelsk.
- Endringene berører kun `prompts.ts` (edge), `RiskAssessmentDialog.tsx` (klient-logging) og to JSON-filer (oversettelser). Ingen DB-endringer.
