

# AI-foreslåtte kurskategorier + talende intro-slides

Bygger om AI Kursgeneratoren slik at AI selv leser manualen og foreslår flere kurs-temaer (hvert med kapittelreferanse). Brukeren velger ett tema, og AI genererer et **test-orientert** kurs som starter med talende, visuelt rike intro-slides (TTS + AI-bilder) før spørsmålene.

## Ny brukerflyt

```text
Steg 1: Last opp manual (uendret)
  ↓
Steg 2: AI foreslår 5–8 kurs-temaer
  [☐ Nødprosedyrer ved tap av GPS — Kap. 7.3]
  [☐ Batterihåndtering og lagring — Kap. 4.1–4.2]
  [☐ Pre-flight inspeksjon — Kap. 3]
  ...
  Hvert forslag: tittel + kapittelreferanse + 2-linjes forklaring
  Brukeren velger ETT (eller flere → ett kurs per).
  ↓
Steg 3: Velg lengde (5/10/15 spm) + om narrasjon skal genereres
  ↓
Steg 4: Generering
  - AI lager 2–3 intro-slides (forklarende tekst, hver med tittel)
  - Hver intro-slide får AI-generert bilde (Nano Banana)
  - Hver intro-slide får TTS-lyd
  - Deretter X spørsmål (ren test-modus, ingen scenario-friskrift)
```

## Datamodell (bygger på eksisterende `training_questions`)

`training_questions.slide_type` brukes allerede (`content` / `question` / `video`). Vi utvider `content_json` for `slide_type='content'` med:

```json
{
  "narration_text": "...",          // det TTS skal lese
  "narration_audio_url": "...",     // ferdig generert mp3 i Storage
  "ai_generated": true,
  "source_reference": "Kap. 7.3"
}
```

Bilde lagres på eksisterende `training_questions.image_url`.

Ny storage-bucket `training-narration` (privat, signed URL) for mp3-filer.
Eksisterende `course-images`-bucket (eller ny `training-visuals`) brukes til AI-bilder.

Ingen schema-endringer på spørsmål — kun ny bucket + RLS.

## Edge functions

**1. `suggest-course-topics`** (NY)
- Input: `manual_id`
- Henter et representativt utvalg chunks (med headings) fra `manual_chunks`
- Ber `gemini-2.5-pro` via tool-call returnere:
  ```json
  { "topics": [
      { "title": "...", "chapter_reference": "Kap. 7.3",
        "description": "Hva kurset dekker, 1-2 setninger",
        "focus_query": "kort søkesetning for retrieval" }
  ] }
  ```
- Returnerer 5–8 forslag

**2. `generate-course`** (UTVIDES)
- Nye input-felt: `topic_title`, `topic_description`, `chapter_reference`, `focus_query`, `include_narration: boolean`, `include_visuals: boolean`
- AI-schema utvides: `intro_slides: [{ heading, narration_text, image_prompt, source_reference }]` + `questions: [...]` (kun multiple_choice — fjerner scenario-typen for å holde det til en ren test)
- Etter AI-svar:
  - For hver intro-slide:
    - Generer bilde via `google/gemini-2.5-flash-image` (Nano Banana) → last opp til Storage → lagre URL i `image_url`
    - Generer TTS via Lovable AI Gateway TTS-endepunkt → last opp mp3 → lagre URL i `content_json.narration_audio_url`
  - Sett inn intro-slides FØR spørsmål (sort_order 0..n), spørsmål etter
- Skipper bilde/lyd hvis togglen er av (gir tekstbasert intro-slide kun)

## Frontend

**`AICourseGeneratorDialog.tsx`** — utvides til 4 steg:
- Steg 1 Upload (uendret)
- Steg 2 NY `TopicSuggestionsStep`: kortliste med foreslåtte temaer, hver som klikkbart kort med tittel, kapittel-badge og beskrivelse. Brukeren velger ETT kort.
- Steg 3 Config (forenkles): kun antall spørsmål, mappe, og to togglene «Inkluder talende intro» og «Inkluder bilder». Rolle/vanskelighet/fokus-tekst fjernes (avledes av valgt tema).
- Steg 4 Genererer (med detaljerte stage-meldinger: «Lager intro-tekst…», «Genererer bilde 1/3…», «Lager tale…», «Lager spørsmål…»)

**Avspilling i eksisterende kursvisning**
`TakeCourseDialog.tsx` viser allerede slides paginert. For `slide_type='content'` med `narration_audio_url` legger vi til en `<audio controls autoPlay>` over bildet, og en stor «Neste»-knapp som blir aktiv når lyd er ferdig (eller umiddelbart hvis brukeren foretrekker det). Ingen videointegrasjon trengs.

## Tekst-til-tale

Bruker Lovable AI Gateway sin TTS-modell (OpenAI TTS via gatewayen). Norsk stemme prioriteres. Hver intro-slide får én mp3 (~30–60 sek). Filene lastes opp til `training-narration/{company_id}/{course_id}/{slide_id}.mp3` og hentes via signed URL ved avspilling.

Hvis TTS ikke er tilgjengelig i gatewayen, faller vi tilbake til klient-side `SpeechSynthesisUtterance` (Web Speech API) som lar nettleseren lese teksten — gratis, men stemmekvalitet varierer per OS.

## Bilder

`google/gemini-2.5-flash-image` (Nano Banana) — én prompt per intro-slide, generert serverside i `generate-course`. Vi gir AI en stilguide i prompten («profesjonell teknisk illustrasjon, mørk SaaS-bakgrunn, ingen tekst i bildet, fotorealistisk drone-kontekst») så det matcher AviSafes mørke tema.

## Filer som endres

**Nye:**
- `supabase/functions/suggest-course-topics/index.ts`
- `src/components/training/TopicSuggestionsStep.tsx`
- Migrasjon: ny storage bucket `training-narration` + RLS, ny bucket `training-visuals` + RLS

**Endret:**
- `supabase/functions/generate-course/index.ts` — schema, intro-slides, bilde- og lydgenerering, kun multiple_choice
- `src/components/training/AICourseGeneratorDialog.tsx` — 4-stegs flyt, fjern rolle/vanskelighet, legg til toggles
- `src/components/training/TakeCourseDialog.tsx` — `<audio>`-element for narration på content-slides
- `supabase/config.toml` — registrer `suggest-course-topics`

## Kostnads-/begrensningsnotat

- 3 intro-slides × (1 bilde + 1 TTS-lyd) = ~6 ekstra AI-kall per kurs. Bør være OK.
- TTS-fallback til Web Speech API hvis brukeren skrur av «Inkluder talende intro».
- AI-video ekskluderes som du selv foreslo — for dyrt/tregt akkurat nå.

