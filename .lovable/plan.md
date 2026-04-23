
# Fiks lydtap etter AI-generering av kurs

## Bekreftet årsak

Lyden blir faktisk generert riktig i edge-funksjonen:

- `generate-course`-loggen viser `openai status=200`
- mp3 lastes opp
- `content_json` blir verifisert som `NOT NULL`

Men det nye AI-kurset blir deretter åpnet direkte i kurseditoren, og når kurset lagres der blir alle slides skrevet tilbake med:

- `content_json: null`

Det sletter:
- `narration_audio_url`
- `narration_text`
- `heading`
- `source_reference`
- forklaringer på spørsmål

Dermed finner `TakeCourseDialog` ingen lyd-URL og har ingenting å spille av.

## Endringer som skal gjøres

### 1. Behold `content_json` i kurseditoren ved lagring
Oppdater `src/components/admin/TrainingCourseEditor.tsx` slik at editoren ikke nullstiller `content_json` for eksisterende AI-slides.

Bytt fra:
- `content_json: null`

til:
- `content_json: s.content_json ?? null`

for alle slide-typer ved insert/sync mot `training_questions`.

Dette alene stopper tap av lyd og metadata.

### 2. Beskytt AI-kurset mot unødvendig lagring rett etter generering
Oppdater `src/components/admin/TrainingSection.tsx` slik at `onCourseCreated` ikke automatisk åpner editoren for AI-genererte kurs.

Dagens flyt:
- AI-kurs opprettes
- `setEditingCourseId(courseId)`
- `setEditorOpen(true)`

Ny flyt:
- oppdater kurslisten
- eventuelt vis toast “Kurs opprettet”
- ikke åpne editor automatisk

Dette reduserer risikoen for at brukeren lagrer et AI-kurs uten å være klar over at metadata kan overskrives.

## Filer som endres

- `src/components/admin/TrainingCourseEditor.tsx`
  - Bevar `content_json` når slides lagres
- `src/components/admin/TrainingSection.tsx`
  - Fjern auto-åpning av editor etter AI-generering

## Forventet resultat

Et nytt AI-generert kurs vil da beholde:
- lyd-URL
- opplesningstekst
- slide-heading
- kildehenvisning
- forklaringstekst på spørsmål

Og `TakeCourseDialog` vil igjen kunne vise:
- `<audio controls autoPlay>` når `narration_audio_url` finnes
- fallback-knapp for opplesning når bare `narration_text` finnes

## Verifisering etter endring

1. Generer et nytt AI-kurs
2. Åpne kurset i forhåndsvisning uten å lagre det i editor
3. Bekreft at intro-slidene viser lydspiller
4. Lagre deretter kurset i editor
5. Åpne forhåndsvisning igjen og bekreft at lyden fortsatt finnes

## Teknisk detalj

Problemet er ikke OpenAI, ikke edge-funksjonen og ikke selve avspilleren. Problemet er at frontend-editoren overskriver databasen etterpå med `content_json = null`, og dermed sletter lydreferansen som allerede var lagret korrekt.
