# Stabiliser oppdragsdetaljer etter iOS-tastatur

Ingen databaseendringer, ingen nye tekster og ingen endringer i felles dialogsentrering, animasjoner eller flylogg-dialoger.

## Endringer

1. **Utvid eksisterende viewport-hook** (`src/hooks/useVisualViewportVar.ts`)
   - Gjenbruk den allerede globalt monterte hooken; ingen ekstra global hook eller separat lytteroppsett.
   - Oppdag redigerbare felt (`input`, `textarea`, `select`, `[contenteditable]`) uten UA-sniffing.
   - Ved første `focusin` i en fokusøkt lagres sidens `scrollY`.
   - Ved `focusout` ventes omtrent 120 ms. Når fokus ikke lenger er i et redigerbart felt, gjenopprettes lagret scrollposisjon hvis siden er flyttet eller `visualViewport.offsetTop > 0`.
   - Eksporter `resetViewportAfterKeyboard()` slik at nestede dialoger kan be om samme gjenoppretting etter lukking. Funksjonen nullstiller fokusøktens lagrede posisjon og oppdaterer `--vvh` straks, etter 300 ms og etter 600 ms.
   - Hold referanser til alle timeouts og `requestAnimationFrame`, og rydd lyttere/timere ved avmontering. Scroll på desktop/Android forblir en no-op når posisjonen ikke har endret seg.

2. **La felles dialoghøyde følge synlig viewport** (`src/index.css`)
   - Behold eksisterende `vh`-linje først og `dvh`-linje etterpå.
   - Legg til `max-height: calc(var(--vvh, 100vh) * 0.9 - 2 * var(--update-banner-h, 0px));` sist, slik at den faktiske synlige høyden vinner når hooken er aktiv, med en Chromium 70-kompatibel fallback.

3. **Fjern lokal høydeoverstyring** (`src/components/dashboard/MissionDetailDialog.tsx`)
   - Fjern bare `max-h-[90vh]` fra `DialogContent`.
   - Behold `overflow-y-auto`, `[touch-action:pan-y]`, `[-webkit-overflow-scrolling:touch]` og resten av dialogoppsettet uendret, slik at den arver `.dialog-max-h` fra basekomponenten.

4. **Lukk tastaturet før merknadsdialogen** (`src/components/dashboard/MissionNotesDialog.tsx`)
   - Etter vellykket lagring: blur aktivt element før `onOpenChange(false)`.
   - Kall deretter `resetViewportAfterKeyboard()` for å gjenopprette vindusposisjon og måle synlig høyde på nytt mens oppdragsdetaljene fortsatt er åpne.
   - Behold lagring, varsling og dialogflyt ellers uendret.

## Validering

- Kjør `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
- Kontroller i mobilvisning at Oppdragsdetaljer → Merknad → skriv → Lagre beholder synlig og trykkbar X-knapp, også når siden var rullet før åpning.
- Gjenta flyten fem ganger og kontroller både opprinnelig topposisjon og en nedrullet side.
- Kontroller desktop og DJI-kompatibilitet: scrollområdene virker, `vh` står før `dvh`, og flyloggens split-view er urørt.
- En fysisk iPhone/iOS Safari er endelig akseptansetest; den lokale nettlesertesten kan kontrollere layout og hendelsesflyt, men kan ikke fullt ut simulere iOS-tastaturets viewport-feil.
