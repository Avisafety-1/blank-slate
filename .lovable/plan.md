
## Fix første rute-klikk over NOTAM-områder

### Sannsynlig rotårsak
Problemet ser ut til å være at NOTAM-laget er rendret i vanlig visningsmodus først, og når brukeren går over til ruteplanlegging blir ikke de eksisterende NOTAM-featureene oppdatert umiddelbart nok. Etter første pan/zoom skjer en ny `fetchNotamsInBounds(...)`, og da bygges NOTAM-laget på nytt med riktig ikke-interaktiv oppførsel for ruteplanlegging. Derfor virker det først etter at kartet har “rørt seg”.

Det er også et ekstra faresignal i dagens kode:
- `notamPane` deaktiveres med `pointerEvents = "none"` på pane-nivå
- men NOTAM-laget rebuildes ikke ved modusbytte
- og CSS-fallbacken i `src/index.css` dekker ikke `.leaflet-notam-pane`
- i tillegg opprettes en egen `notamRenderer` i `fetchNotamsInBounds`, som kan etterlate interaktive SVG-elementer fra view-modus til neste refresh

### Plan
1. **Gå gjennom modusbytte i `OpenAIPMap.tsx`**
   - Bekreft hvor `mode` skifter fra `view` til `routePlanning`
   - Sørg for at NOTAM-laget reagerer eksplisitt ved modusbytte, ikke bare ved `moveend`

2. **Tving oppfriskning av NOTAM-laget når ruteplanlegging aktiveres**
   - På samme sted der andre interaktivitetsendringer skjer ved `mode`-endring, trigge en umiddelbar re-render/re-fetch av `notamLayer`
   - Dette gjør at NOTAM-featureene bygges med `interactive: false` med én gang, uten å vente på zoom/pan

3. **Gjør NOTAM-fallbacken robust**
   - Oppdater CSS i `src/index.css` slik at også `.route-planning-active .leaflet-notam-pane .leaflet-interactive` får `pointer-events: none !important`
   - Dette blir et ekstra sikkerhetsnett om Leaflet eller rendereren etterlater interaktive elementer

4. **Unngå hengende renderer-/DOM-tilstand**
   - Se over `fetchNotamsInBounds` i `src/lib/mapDataFetchers.ts`
   - Sikre at dedikert NOTAM-renderer ikke etterlater gamle interaktive elementer mellom refreshes
   - Ved behov: rydde gammel renderer eller bruke en stabil renderer-instans i stedet for å opprette ny hver fetch

5. **Verifisere oppførselen som skal fungere**
   - Første klikk i ruteplanlegging på et område med NOTAM skal legge første rutepunkt direkte
   - Skal fungere uten pan/zoom først
   - NOTAM skal fortsatt være klikkbart i vanlig visning
   - NOTAM skal fortsatt ligge over andre luftromslag, men under rute/UI

### Filer som sannsynligvis må endres
- `src/components/OpenAIPMap.tsx`
- `src/lib/mapDataFetchers.ts`
- `src/index.css`

### Tekniske detaljer
```text
Nåværende flyt:
view mode
  -> NOTAM renderes som interactive
  -> bruker aktiverer routePlanning
  -> pane pointer-events endres
  -> eksisterende NOTAM-featuree kan fortsatt blokkere første klikk
  -> pan/zoom
  -> NOTAM fetches på nytt
  -> da fungerer det

Ønsket flyt:
view mode
  -> bruker aktiverer routePlanning
  -> NOTAM rebuildes/deaktiveres umiddelbart
  -> første klikk går rett til kartets route handler
```
