## Problem

I split-view (når man har valgt en pending logg til behandling) er venstre kolonne i `UploadDroneLogDialog` satt til `flex flex-col` uten `min-h-0`/scroll. Når listen "Ventende flylogger fra auto-sync" vokser, presses innholdet utenfor dialogens høyde og scrolling fungerer ikke — kun høyre panel (som har egen `ScrollArea`) er scrollbar.

Uten split-view har dialogen `max-h-[90vh] overflow-y-auto`, så hele dialogen scroller. Men i split-view byttes klassen til `h-[95vh] flex flex-col` uten overflow, og venstre kolonne arver dette uten egen scroll.

## Fiks – `src/components/UploadDroneLogDialog.tsx` (linje ~3164–3306)

1. **Venstre kolonne får intern scroll.** Endre den ytre containeren slik at den fyller dialogen og scroller når innholdet blir for høyt:
   - Legg `min-h-0` på venstre `<div>` (linje 3166), slik at flex-barnet faktisk kan krympe under content-høyde.
   - Splitt venstre kolonne i to deler:
     - **Sticky topp (ikke-scrollbar):** "Velg metode"-tekst, kort-grid (Last opp fil / DJI-konto), evt. "Sync nå"-knapp og sync-feedback. Disse blir alltid synlige.
     - **Scrollbar bunn:** wrapper rundt `<PendingDjiLogsSection>` med `flex-1 min-h-0 overflow-y-auto pr-1` (eller en `<ScrollArea className="flex-1 min-h-0">`). Da scroller selve loggfil-listen mens valgknappene øverst blir værende.

2. **Ingen endringer i ikke-split-modus.** Klassetoggle på linje 3166 beholdes (`w-1/3 min-w-[280px] shrink-0 flex flex-col min-h-0` kun når split-view er aktiv).

3. **Høyre panel** rører vi ikke — `ScrollArea` der fungerer som det skal.

## Resultat

- Når mange loggfiler ligger i auto-sync-listen, scroller venstre liste internt i stedet for å pushe dialogen utover viewport.
- Kortene "Last opp fil"/"DJI-konto" og "Sync nå" forblir synlige som faste handlinger på toppen av venstre kolonne.
- Behandling av en valgt logg (høyre panel) er upåvirket.