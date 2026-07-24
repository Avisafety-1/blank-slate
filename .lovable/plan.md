# Fikse rå i18n-nøkler i risikovurdering-PDF

## Hva som er galt
`src/lib/riskAssessmentPdfExport.ts` kaller `i18n.t('pdf.riskAssessment.…', { ns: 'pdf' })` overalt. Fordi namespace allerede er `pdf`, blir det reelle oppslaget `pdf.pdf.riskAssessment.…` — det finnes ikke, så i18next returnerer nøkkelstrengen som fallback. Dette gir PDF-en Norconsult/Hamar så, og forklarer også hvorfor dokumentets tittel, beskrivelse og filnavn i biblioteket vises som `pdf.riskAssessment.documentCategoryTitle.ai` osv. (samme generator skriver disse feltene til DB).

Ingen andre PDF-generatorer er berørt — `FlightLogbookDialog`, `incidentPdfExport`, `userManualPdf` bruker riktig mønster (nøkkel uten `pdf.`-prefix + `ns: 'pdf'`).

## Endringer

### 1. `src/lib/riskAssessmentPdfExport.ts` (kun denne filen)
Fjerne `pdf.`-prefix fra alle `i18n.t(...)`-kall som allerede har `{ ns: 'pdf' }`. Konkret:
- `'pdf.riskAssessment.…'` → `'riskAssessment.…'`
- `'pdf.common.…'` → `'common.…'`
- Alle ~150 forekomster i filen. Trygg mekanisk erstatning: kun strenger som starter med `'pdf.` og ligger inne i et `i18n.t(...)`-kall med `ns: 'pdf'`.

Verifisere at hverken norsk (`no/pdf.json`) eller engelsk (`en/pdf.json`) mangler noen av nøklene som brukes (spot-check på `riskAssessment.titleAi`, `.sections.*`, `.labels.*`, `.go.*`, `.mitigations.*`, `.categories`, `.hardStop`, `.documentCategoryTitle.ai/sora`, `.documentDescription.ai/sora`, `.filenamePrefixAi/Sora`, `common.yes/no`).

### 2. Ingen andre kodeendringer
- Ingen endring i i18n-filer, namespace-oppsett eller andre eksportere.
- Ingen endring i logikk, kun nøkkelstrenger.

### 3. Rydding av eksisterende dokumenter (valgfritt, kun etter kodefiks)
Dokumenter som allerede er lagret med rå nøkler som `title`/`beskrivelse`/`filename` (som i Norconsult Hamar) kan enten:
- **A) La være** — brukerne kan slette og re-eksportere risikovurderingen; nye eksporter blir riktige.
- **B) SQL-rydding** — kjøre en engangs-oppdatering på `documents`-tabellen som bytter kjente råe nøkler (`pdf.riskAssessment.documentCategoryTitle.ai`, `.sora`, `.documentDescription.ai`, `.sora`, `pdf.riskAssessment.filenamePrefixAi`, `Sora`) med tilsvarende oversatt tekst basert på selskapets språk. Krever bekreftelse før kjøring.

Anbefaler A først (lavest risiko); tar B som eget steg dersom du ønsker det.

## Verifisering
1. `tsgo` for typesjekk.
2. Manuelt: eksportere en AI-risikovurdering på norsk og på engelsk, sjekke at PDF-en viser oversatt tekst i alle seksjoner og at dokumentkortet i biblioteket viser riktig tittel/beskrivelse/filnavn.
3. Grep for `'pdf\.` i `riskAssessmentPdfExport.ts` skal returnere 0 treff etter endring.

## Tekniske detaljer
- i18next-oppsett i `src/i18n/index.ts` registrerer `pdf` som eget namespace (`ns: ['translation', 'pdf']`). Med `{ ns: 'pdf' }` skal nøkkelen være relativ til rot i `pdf.json`.
- Bugsjekk: `grep -c "i18n.t('pdf\." src/lib/riskAssessmentPdfExport.ts` gir ~150 treff i dag; skal være 0 etter fiks.
