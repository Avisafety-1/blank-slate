# Problem

Risikovurderingen kommer alltid på norsk uansett UI-språk, selv etter at hovedpromptene (`buildSystemPromptEN`/`buildUserPromptEN`) ble styrket.

# Rot­årsak

Når brukeren kjører en risikovurdering via dialogen, går kallet faktisk gjennom **SORA re-assessment-grenen** i `supabase/functions/ai-risk-assessment/index.ts` (linje 430). Den grenen har **hardkodede norske prompts**:

- `soraSystemPrompt` (linje 433) — starter med `"Du er en SORA-spesialist…"`
- `soraUserPrompt` (linje 587) — `"Generer en SORA-analyse basert på følgende data…"`

Disse promptene leser **aldri** `language`-parameteren. Endringene i `prompts.ts` (`buildSystemPromptEN`/`buildUserPromptEN`) brukes kun i den "vanlige" risikovurderings-grenen lenger ned, ikke i SORA re-assessment.

Edge-loggene bekrefter dette — siste kjøring traff SORA-grenen og produserte norsk output uansett `language: "en"`.

# Plan

### 1. Flytt SORA-promptene til `prompts.ts` med språkvariant

Legg til to nye eksporterte funksjoner i `supabase/functions/ai-risk-assessment/prompts.ts`:

- `buildSoraReassessSystemPrompt(lang: Lang): string`
- `buildSoraReassessUserPrompt(lang: Lang, previousAnalysis, pilotComments): string`

Norsk versjon = eksisterende tekst (kopier ordrett fra index.ts linje 433–585 og 587–597).

Engelsk versjon = oversettelse av samme innhold, med samme strenge språkdirektiv på toppen som de andre EN-promptene:
> "CRITICAL LANGUAGE INSTRUCTION: You MUST respond ENTIRELY in English. Input data may contain Norwegian terms — translate them. Never mirror Norwegian in your output."

### 2. Bruk språkvariant i `index.ts`

I `supabase/functions/ai-risk-assessment/index.ts` linje 430–612:

- Erstatt hardkodede `soraSystemPrompt`/`soraUserPrompt`-konstantene med kall til de nye prompt-builder-funksjonene, ved bruk av samme resolved language som `prompts = getPrompts(language)` allerede gir.
- Legg til en logg-linje `console.log('[ai-risk-assessment/SORA] Using language:', lang)` for å bekrefte i edge-loggene.

### 3. Verifisering

1. Bytt UI til engelsk, kjør risikovurdering på samme oppdrag.
2. Sjekk edge-funksjonens logg for:
   - `[ai-risk-assessment] Received language from client: "en" -> resolved: en`
   - `[ai-risk-assessment/SORA] Using language: en`
3. Bekreft at `soraAnalysis.summary` og alle felt nå er på engelsk.
4. Bytt tilbake til norsk, kjør på nytt, bekreft norsk output (regresjonssjekk).

# Filer som endres

- `supabase/functions/ai-risk-assessment/prompts.ts` — to nye eksporterte funksjoner (NO + EN varianter av SORA-prompt)
- `supabase/functions/ai-risk-assessment/index.ts` — erstatt hardkodede prompts (linje 433–597) med kall til de nye funksjonene

Ingen frontend-endringer nødvendig — `language: lang` sendes allerede korrekt fra `RiskAssessmentDialog.tsx`.
