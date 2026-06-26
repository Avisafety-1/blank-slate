## Mål
Flytte "Inspiser"-knappen (musepeker-ikon) fra den øverste horisontale ruteplanlegger-verktøylinjen til høyre sidekartkontrollstack, rett under 2D/3D-knappen, slik brukerens markering i skjermbildet viser.

## Hva som skal endres

### 1. `src/pages/Kart.tsx`
- Fjern "Inspiser"-knappen fra den øverste horisontale ruteplanlegger-verktøylinjen (både mobil- og desktop-layout).
- behold `routeInspectMode`-state og toggle-funksjonen.
- Når 2D-kartet (`OpenAIPMap`) rendres og `isRoutePlanning` er aktiv, send en vertikal knappegruppe som `stackSlotAboveLayers` som inneholder:
  - eksisterende 2D/3D-veksleknapp
  - ny "Inspiser"-knapp under den
- Knappen skal bare vises når `isRoutePlanning` er true.

### 2. `src/components/OpenAIPMap.tsx`
- Ingen endring av funksjonalitet; `routeInspectMode`-prop og klikklogikk beholdes som i dag.
- Høyre stack rendrer `stackSlotAboveLayers` på samme plassering (under kartlags-knappen), slik at knappen kommer på riktig sted.

### 3. 3D-kart (`Map3D`)
- Ingen endring for 3D-modus. 3D-kartet har ikke inspeksjonsmodus-implementasjon, så Inspiser-knappen vises kun i 2D-kartet for å unngå brukket eller forvirrende oppførsel.

## Visuell plassering (2D-kart)

```text
[ Vær ]
[ Grunnkart ]
[ Kartlag ]
[ 2D/3D-knapp ]  <- eksisterende
[ Inspiser ]     <- ny plassering
[ Planlegg rute ]  (kun i visningsmodus)
```

## Tekniske detaljer
- `stackSlotAboveLayers` aksepterer `React.ReactNode` og rendres i `OpenAIPMap` ved linje 1681.
- Vi pakker `toggle3DBtn` og en ny `routeInspectMode`-knapp inn i en `<>`-fragment med `flex flex-col gap-2` slik at de følger den samme visuelle stilen som resten av stacken.
- Fjern `MousePointer2` fra mobil- og desktop-verktøylinjene i ruteplanleggeren.
- Behold `import { MousePointer2 }` fordi ikonet skal brukes i den nye høyre-stack-knappen.
- `routeInspectMode` prop sendes fortsatt til `OpenAIPMap` for at klikklogikken skal fungere som før.