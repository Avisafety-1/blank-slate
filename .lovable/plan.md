

## Plan: Større innhold i fullskjermsmodus for kurs på iPad

### Problem
I fullskjerm på iPad får videoer og bilder bare ca. halve skjermbredden fordi innholdet er begrenset av `max-w-3xl` / `max-w-5xl` / `max-w-2xl` selv når dialogen tar hele skjermen. Resultat: mye tomt rom rundt videoen.

### Løsning
I `src/components/training/TakeCourseDialog.tsx` — fjerne snevre maks-bredder når `isFullscreen = true` slik at video, bilder og spørsmålskort fyller tilgjengelig plass:

**1. Video-slide (`renderSlide`, video-grenen)**
- Fullskjerm: bytt `max-w-5xl` → `max-w-[90vw]` (eller `max-w-none w-full`), og la wrapperen sentrere innholdet
- Ikke-fullskjerm: behold `max-w-3xl`

**2. Innholds-/bildeslide (content-grenen)**
- Fullskjerm: la bildet bruke `max-h-[78vh]` og `w-auto max-w-[92vw]` slik at bredt landskapsformat fyller skjermen, ikke bare høyden

**3. Spørsmål-slide (question-grenen)**
- Fullskjerm: bytt kortets `max-w-2xl` → `max-w-4xl` for bedre lesbarhet og luftighet på iPad. Bildet i spørsmål: `max-h-[55vh]` i fullskjerm
- Ikke-fullskjerm: behold `max-w-2xl`

**4. Padding på fullskjerm-wrapper**
- I `DialogContent`-wrapper: redusér `p-4 sm:p-6` → `p-2 sm:p-4` i fullskjerm slik at innholdet får ~24-32px ekstra plass på hver side

**5. Video-container høyde**
- YouTubeClipPlayer beholder `aspect-video`. Når wrapperen er bredere blir videoen automatisk større. Ingen endring i komponenten.

### Filer som endres
- `src/components/training/TakeCourseDialog.tsx` — kondisjonelle Tailwind-klasser basert på `isFullscreen` for video-, bilde- og spørsmålsblokkene + redusert padding

### Resultat
På iPad i fullskjerm vil videoer fylle ~90% av skjermbredden (i stedet for ~50%), bilder bruker både bredde og høyde, og spørsmålskort blir bredere og mer behagelig å lese. Vanlig (ikke-fullskjerm) modus er uendret.

