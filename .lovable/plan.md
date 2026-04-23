

# Bytt til OpenAI gpt-4o-mini-tts med bedre stemme + prompt-styring

OpenAI har en nyere TTS-modell (`gpt-4o-mini-tts`) som er mer naturlig enn `tts-1`, og som lar oss styre tone, tempo og følelse via en `instructions`-parameter. I tillegg har vi tilgang til høykvalitets-stemmer som `marin` og `cedar` (anbefalt av OpenAI), samt klassikere som `coral`, `sage` og `nova`.

## Endringer

### A. Oppgrader TTS-modell og stemme i `generate-course/index.ts`
- Bytt fra `tts-1` til **`gpt-4o-mini-tts`** (mer naturlig prosodi, bedre på norsk)
- Bytt fra `nova` til **`coral`** som standard (varmere, mer engasjerende — passer til opplæring). `marin`/`cedar` er nyeste, men optimalisert for engelsk.
- Legg til **`instructions`**-parameter: «Snakk i en rolig, profesjonell og lærerik tone på norsk. Tydelig artikulasjon, moderat tempo, vennlig og inkluderende.»
- Behold `mp3` som format (best kompatibilitet med `<audio>`-tag i nettleser)

### B. Brukervalgbar stemme (valgfritt, anbefalt)
Legg til en stemme-velger i `AICourseGeneratorDialog.tsx` slik at brukeren kan velge mellom:
- **Coral** (varm kvinnestemme — standard)
- **Sage** (rolig kvinnestemme)
- **Onyx** (dyp mannstemme)
- **Nova** (lys, energisk kvinnestemme)

Stemmen sendes med i request-bodyen til edge-funksjonen.

### C. Behold fallback-logikken
Web Speech API-fallback i `TakeCourseDialog.tsx` står urørt — den brukes fortsatt hvis OpenAI feiler eller `narration_audio_url` mangler.

## Filer som endres

- `supabase/functions/generate-course/index.ts` — bytt modell til `gpt-4o-mini-tts`, ta imot `voice` fra request body (default `coral`), legg til `instructions` for norsk lærer-tone
- `src/components/training/AICourseGeneratorDialog.tsx` — legg til Select-felt for stemme i steg 4 (kun synlig når «Inkluder talende intro» er på), send `voice` med i invoke-kallet

## Hva du må gjøre etterpå

Slett det forrige kurset «Planlegging av Oppdrag og Analyse av Luftrom» og generer det på nytt. Du vil høre tydelig forskjell — `gpt-4o-mini-tts` med `coral` + norsk-instruksjon låter merkbart mer naturlig enn `tts-1` med `nova`.

## Kostnadsnotat

`gpt-4o-mini-tts` er ~$0.015 per 1000 tegn — samme prisnivå som `tts-1`. Ingen ekstra kostnad for å oppgradere.

