# Stabiliser tastaturdialoger på iOS og Android-PWA

Ingen databaseendringer, ingen nye tekster og ingen endringer i dialoganimasjoner eller flylogg-dialogenes egne posisjoner.

## Endringer

1. **La Android-tastaturet krympe innholdsområdet** (`index.html`)
   - Legg `interactive-widget=resizes-content` til eksisterende viewport-meta uten å endre de øvrige verdiene.
   - Android Chrome/PWA kan da sentrere fixed-dialoger over tastaturet; iOS og eldre Chromium kan ignorere nøkkelen og bruker visual-viewport-løsningen under.

2. **Utvid den eksisterende viewport-hooken** (`src/hooks/useVisualViewportVar.ts`)
   - I samme `update()` som setter `--vvh`, sett `--vvt` fra `visualViewport.offsetTop`, med `0px` som fallback.
   - Behold eksisterende `visualViewport`- og vinduslyttere; ikke opprett en ny global hook og ikke bruk UA-sniffing.
   - Legg til én `focusout`-lytter. Etter omtrent 150 ms kontrolleres om aktivt element ikke er `input`, `textarea`, `select` eller `[contenteditable]`.
   - Når tastaturet er lukket, oppdater viewportvariablene straks og på nytt etter 300 og 600 ms. Hvis `visualViewport.offsetTop > 0`, kall `window.scrollTo(window.scrollX, window.scrollY)` for å tvinge ny layout/repaint.
   - Spor alle timeouts og `requestAnimationFrame`, og rydd dem og alle lyttere ved avmontering.

3. **Bruk synlig høyde og synlig sentrum for vanlige dialoger** (`src/index.css`)
   - Utvid `.dialog-max-h` med en tredje, siste regel basert på `--vvh`, med `100vh` som fallback. Behold eksisterende `vh` før `dvh`.
   - Legg `.dialog-vv-center` ved siden av den eksisterende klassen, med vanlig `top: 50%` fallback og deretter sentrum beregnet fra `--vvt + --vvh / 2`.
   - Kontroller CSS-kaskaden eksplisitt: den nye sentreringen skal vinne over baseklassens vanlige `top-[50%]`, mens dialoger med egne posisjonsregler fortsatt skal vinne. Hvis Tailwind flytter components-laget foran utilities, gis den nye klassen bare nødvendig selektorspesifisitet; flyloggens eksplisitte `!top`/`!bottom` skal fortsatt overstyre den.

4. **Aktiver visual-viewport-sentrering i felles dialog** (`src/components/ui/dialog.tsx`)
   - Legg `dialog-vv-center` til baseklassene i `DialogContent`.
   - Behold `top-[50%]`, translate-sentrering og alle åpne/lukke-animasjoner som de er.
   - Ikke endre DJI non-modal-logikken eller håndtering av klikk utenfor dialogen.

5. **Fjern lokal høydeoverstyring i oppdragsdetaljene** (`src/components/dashboard/MissionDetailDialog.tsx`)
   - Fjern bare `max-h-[90vh]` fra `DialogContent`, slik at `.dialog-max-h` gjelder.
   - Behold `overflow-y-auto`, `[touch-action:pan-y]`, `[-webkit-overflow-scrolling:touch]` og resten av oppsettet.

6. **Lukk tastaturet før lagringsflyten lukker dialogen**
   - I `AddMissionDialog.tsx`: blur aktivt element etter vellykket lagring, men før `onMissionAdded`/`onMissionAddedWithData` og lukking. Behold eksisterende inline `maxHeight` med `--vvh`.
   - I `MissionNotesDialog.tsx`: blur aktivt element etter vellykket lagring og før `onOpenChange(false)`.
   - Endre ikke lagring, varsling, validering eller øvrig dialogflyt.

## Validering

- Kjør `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
- Test mobil viewport med både opprett/rediger-dialogen og Oppdragsdetaljer → Merknad: fokuser Merknader, skriv og lagre; header og X skal være synlige og trykkbare før og etter tastaturet lukkes.
- Gjenta merknadsflyten flere ganger, også når dashbordet var rullet før dialogen åpnet.
- Kontroller at `--vvh` og `--vvt` oppdateres ved både resize og visual-viewport-scroll, samt ved de forsinkede målingene etter blur.
- Kontroller desktop og DJI-kompatibilitet: vanlige dialoger er sentrert som før, `vh` står før `dvh`, scrollområdene beholder touch-rulling, og `.dji-log-split`/flyloggens prosentbaserte split-view har uendret posisjon.
- Endelig akseptansetest gjøres på fysisk iPhone Safari og Android-PWA; lokal Chromium kan kontrollere CSS, fokusflyt og responsive tilstander, men ikke fullt ut gjenskape begge mobile tastaturmotorene.
