
Mål: gjøre «Rediger drone»-dialogen faktisk mobilvennlig, ikke bare smalere på papiret. Gjennomgangen viser at problemet er større enn bare operasjonssjekklisten.

Hva jeg fant
- `DroneDetailDialog.tsx` bruker `DialogContent className="w-[95vw] max-w-2xl ..."`. Det er i seg selv ikke ekstremt bredt, men innholdet inni dialogen tvinger bredden og gjør at mobil kan få side-scroll.
- Rediger-visningen har mange faste `grid-cols-2` og én `grid-cols-3` uten mobil-breakpoint:
  - modell/serienummer
  - klasse/kjøpsdato
  - vekt/payload
  - flyvetimer/status
  - inspeksjonsfelter
  - varselfelter i 3 kolonner
- Operasjonssjekklister er nå inline `Collapsible`, som er bedre enn `Popover` på mobil, men trigger/layout må fortsatt inngå i en helhetlig mobiltilpasning.
- Det finnes allerede gode mønstre i prosjektet, f.eks. `EquipmentDetailDialog.tsx`, som bruker:
  - `w-[95vw] max-w-2xl`
  - `p-4 sm:p-6`
  - `grid-cols-1 sm:grid-cols-2`
  - mindre typografi på mobil
- Selve `DialogContent`-basekomponenten i `src/components/ui/dialog.tsx` har `w-full max-w-lg p-6` som default. Når en dialog ikke overstyrer padding/bredde smart på mobil, blir den fort trang eller overflow-utsatt.

Plan for implementering
1. Stramme inn selve drone-dialogen på mobil
- Oppdatere `DroneDetailDialog.tsx` til mobilvennlig container, f.eks.:
  - `w-[calc(100vw-1rem)] sm:w-[95vw]`
  - `max-w-2xl`
  - `max-h-[90vh]`
  - `overflow-y-auto`
  - `p-4 sm:p-6`
  - `box-border`
- Målet er å sikre at dialogen alltid holder seg innen viewport, også med intern padding.

2. Gjøre hele redigeringsskjemaet responsivt
- Endre alle relevante `grid-cols-2` til `grid-cols-1 sm:grid-cols-2`.
- Endre `grid-cols-3` i varsel-seksjonen til `grid-cols-1 sm:grid-cols-3` eller `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` hvis det blir mer lesbart.
- Der labels/felter kan bli lange, legge til `min-w-0` på wrappers ved behov for å hindre at innhold presser bredden.

3. Gjøre visningsmodus mer mobilvennlig samtidig
- Samme prinsipp i read-only delen av dronekortet:
  - bytte faste 2-kolonners grids til `grid-cols-1 sm:grid-cols-2`
  - kataloginfo-boksen også til `grid-cols-1 sm:grid-cols-2`
  - sjekke steder med badges/tekstlinjer som kan wrappe dårlig.
- Dette gjør hele kortet konsistent på mobil, ikke bare redigeringsmodus.

4. Finjustere operasjonssjekklister slik at de matcher resten uten å lage overflow
- Beholde inline `Collapsible` i stedet for `Popover`.
- Sørge for at triggeren og innholdet bruker full tilgjengelig bredde uten å presse dialogen:
  - `w-full min-w-0`
  - tekst som wrap’er
  - ingen faste bredder
- Holde layout visuelt tett på «Sjekkliste for inspeksjon» og «Post flight sjekkliste», men innenfor mobilbegrensningene.

5. Kontrollere andre felt som kan skape breddeproblemer
- Sjekke `SearchablePersonSelect`-bruken i dialogen siden den bygger på `Popover`.
- Ved behov legge inn trygg mobilklasse på triggeren i drone-dialogen rundt denne komponenten, eller oppdatere komponenten forsiktig så den ikke kan bidra til overflow i dialogbruk.
- Sjekke footer-knappene:
  - `flex-col sm:flex-row`
  - full bredde på mobil om nødvendig, særlig i redigeringsmodus.

6. Verifisering etter implementering
- Teste spesielt på 390px bredde siden det er brukerens nåværende viewport.
- Kontrollere:
  - ingen horisontal scrolling i dialogen
  - alle seksjoner kan åpnes/lukkes uten overflow
  - operasjonssjekklistene fungerer som multi-select
  - inspeksjon/post-flight ser fortsatt konsistente ut
  - footer-knapper og close-knapp oppfører seg riktig på mobil.

Tekniske detaljer
- Primærfil: `src/components/resources/DroneDetailDialog.tsx`
- Referansemønster: `src/components/resources/EquipmentDetailDialog.tsx`
- Mulig sekundær fil ved behov: `src/components/SearchablePersonSelect.tsx`
- Viktigste grep:
```text
Dialog:
w-[calc(100vw-1rem)] sm:w-[95vw] max-w-2xl p-4 sm:p-6 box-border

Grid:
grid-cols-1 sm:grid-cols-2
grid-cols-1 sm:grid-cols-3

Overflow-sikring:
min-w-0
max-w-full
overflow-x-hidden der nødvendig
```
