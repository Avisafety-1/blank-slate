

## Plan: YouTube-video-slides i kursmodulen

### Mål
1. Admin kan legge til en YouTube-link som en slide-type i kurseditoren
2. Admin kan definere start- og sluttidspunkt (clip) for videoen
3. Når brukeren navigerer til en YouTube-slide under kursgjennomføring, spilles videoen av automatisk fra angitt starttidspunkt og stopper på sluttidspunkt

### Datamodell (ny migrasjon)
Utvider eksisterende `training_questions`-tabell uten å bryte noe:
```sql
ALTER TABLE training_questions
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS video_start_seconds integer,
  ADD COLUMN IF NOT EXISTS video_end_seconds integer;
```
- `slide_type` får ny tillatt verdi: `'video'` (i tillegg til `content` og `question`)
- `video_url` lagrer original YouTube-URL
- Start/slutt i sekunder; null = fra start / til slutt

### Endringer

**1. `src/components/admin/TrainingCourseEditor.tsx`**
- Utvid `Slide.slide_type` til `"content" | "question" | "video"` og legg til felter `video_url`, `video_start_seconds`, `video_end_seconds`
- Ny knapp "Legg til YouTube-video" i slide-listen (ved siden av "Legg til spørsmål")
- For video-slides:
  - Input for YouTube URL (parses `youtube.com/watch?v=`, `youtu.be/`, `shorts/`)
  - To inputs: "Start (sekunder)" og "Slutt (sekunder)" — eller MM:SS-format med konvertering
  - Liten YouTube IFrame-preview som viser klippet
  - Vis varighet og videolengde
- Lagring i `handleSave`: send med de nye feltene til `training_questions`-insert
- Lasting i `loadCourse`: les feltene tilbake

**2. Ny komponent `src/components/training/YouTubeClipPlayer.tsx`**
- Bruker YouTube IFrame Player API (lastes via `<script src="https://www.youtube.com/iframe_api">`)
- Props: `videoId`, `start`, `end`, `autoplay`, `onEnd`
- Initialiserer player med `playerVars: { start, end, autoplay: 1, rel: 0, modestbranding: 1 }`
- Lytter på `onStateChange` for å detektere slutt og kalle `onEnd`
- Polling/timer som tvinger `pauseVideo()` når `currentTime >= end` (sikrer at klippet stopper presist)
- Cleanup ved unmount

**3. `src/components/training/TakeCourseDialog.tsx`**
- Utvid `SlideData` med `video_url`, `video_start_seconds`, `video_end_seconds`
- I `renderSlide` håndter `slide_type === "video"` → render `<YouTubeClipPlayer>` med `autoplay` aktiv når slide er aktiv
- Når brukeren klikker "Neste" fra en pdf-slide til en video-slide, skal autoplay trigges (currentPage-state-endring re-mounter player med autoplay=1)
- Stopp/unmount video-player når brukeren navigerer videre

**4. URL-parsing helper**
Liten helper i komponenten: trekker ut `videoId` fra alle YouTube-URL-formater. Hvis URL er ugyldig: vis feilmelding i editor.

### Filer som endres / opprettes
- `supabase/migrations/<ny>.sql` — legge til 3 kolonner
- `src/components/admin/TrainingCourseEditor.tsx` — ny slide-type + UI for video + clip
- `src/components/training/TakeCourseDialog.tsx` — render video-slide med autoplay
- `src/components/training/YouTubeClipPlayer.tsx` — **ny** komponent

### UX-detaljer
- I editor: video-preview viser nøyaktig det klippet som vil spilles av (IFrame med `start`/`end`)
- Validering: hvis `end <= start`, vis advarsel
- Aksepterer både MM:SS og rene sekunder i tidsfelt (parser begge)
- Sliders for visuell trim: enkel `<Slider>` med to håndtak (range) under preview, hvis videolengde er kjent (hentes via IFrame API `getDuration()`)
- Ved gjennomføring: ingen YouTube-anbefalinger etter stopp (`rel: 0`), automatisk pause på `end`

### Resultat
Admin kan blande PDF-slides, spørsmål og YouTube-videoer i samme kurs. Videoer spilles av automatisk fra angitt starttidspunkt og stopper presist på sluttidspunkt. Klippet trimmes uten å re-encodes — kun avspillingsgrenser settes via YouTube IFrame API.

