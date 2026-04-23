

# Fiks lyd og content_json i AI-kursgenerering

Diagnose etter inspeksjon av siste genererte kurs (`69a310af…`):

## Problemer funnet

**1. `content_json` er fortsatt NULL i databasen.** Bilder lagres OK (image_url satt på 2 første slides), men jsonb-feltet droppes ved insert. Sannsynlig årsak: PostgREST-klienten i Deno serialiserer ikke nested objekter korrekt når raden bygges som et separat `const`-objekt og deretter sendes til `.insert(obj)`. Når `content_json` er null, finnes det ingen `narration_text` å lese opp — så hverken mp3 eller Web Speech-fallback har noe å si.

**2. TTS-kallet logges ikke.** Vi vet ikke om `generateTTS()` faktisk ble kalt, om OpenAI returnerte feil, eller om `slide.narration_text` var tomt fra LLM-en. Edge-loggen viser ingen TTS-relaterte meldinger overhodet.

**3. Embedding-modellen finnes ikke lenger.** `google/text-embedding-004` ble fjernet fra AI Gateway. Vektor-søk feiler hver gang og faller tilbake til "ta hver N-te chunk" (funker, men gir dårligere kontekst-treff).

## Løsning

### A. Fiks `content_json`-persistering definitivt
Bygg insert-objektet inline i `.insert({...})`-kallet (ikke som mellomliggende `const`), og send `content_json` som **`JSON.stringify(contentJson)`**. Postgres jsonb godtar dette og bevarer alle felter. Gjelder både intro-slides og spørsmål-slides.

### B. Eksplisitt TTS-logging
Logg hvert steg: «narration enabled? has text? calling OpenAI… status… bytes returned… upload result». Da kan vi diagnostisere på 1 sekund om det er LLM, OpenAI eller storage som svikter.

### C. Verifiser `OPENAI_API_KEY`-tilgang
Før første TTS-kall, logg om secret er satt (uten å printe verdien). Hvis ikke satt, push warning umiddelbart.

### D. Fjern embedding-kallet
Siden modellen ikke finnes i AI Gateway og fallback (jevn fordeling av chunks) fungerer godt nok for kursgenerering, droppes vektor-søket helt. Det forenkler koden, fjerner en feil-kilde, og sparer et AI-kall per kursgenerering.

### E. Re-generer kurset
Eksisterende kurs (`69a310af…` og `d4d3f5ca…`) må slettes manuelt og genereres på nytt etter fiksen — fordi `content_json` aldri ble lagret er det ingen vei tilbake.

## Filer som endres

- `supabase/functions/generate-course/index.ts`:
  - Inline insert-objekter med `JSON.stringify(contentJson)` for jsonb-feltet
  - Detaljert TTS-logging (enabled/has-text/openai-status/bytes/upload)
  - Sjekk og logg `OPENAI_API_KEY`-tilstedeværelse ved oppstart
  - Fjern `embedQuery()` og direkte hopp til chunked-fallback

Ingen frontend-endringer nødvendig — `TakeCourseDialog` og Web Speech-fallback er allerede klare til å bruke `narration_text` så snart den faktisk lagres.

## Hva du bør gjøre etterpå

1. Slett kurset «Planlegging av Oppdrag og Analyse av Luftrom» fra opplæringsmodulen
2. Generer det på nytt
3. Sjekk edge-loggen for `generate-course` — du vil se TTS-status linje for linje
4. Hvis OpenAI fortsatt feiler, gir loggen oss eksakt feilkode (401 = nøkkel ugyldig, 429 = rate limit, etc.) så vi kan fikse målrettet

