# SORA volum – ny layout og oppførsel i ruteplanlegger

## Mål
1. SORA volum skal være **på som standard** når man starter ruteplanlegging.
2. På PC/iPad skal SORA-volum-menyen vises som et **venstrestilt sidepanel (~1/3 av skjermbredden)**, ikke som en full-bredde dropdown over kartet.
3. Innholdsrekkefølgen i panelet skal endres, og avanserte parametere skal være skjult bak en ekspanderbar seksjon.
4. Når en drone velges skal SORA 2.5-beregningen **brukes automatisk** (ingen klikk på "Bruk SORA 2.5-beregning" lenger).

Mobil beholder dagens oppførsel (panelet rendres under header), kun desktop/tablet får sidepanel-layouten.

---

## Endringer

### 1. Default på (`src/pages/Kart.tsx`)
- I `defaultSoraSettings`: sett `enabled: true` (i dag `false`).
- `soraOpen`-initialverdi settes til `true` slik at panelet er åpent ved start av ruteplanlegging.
- Eksisterende ruter som lastes inn bruker fortsatt sin lagrede `soraSettings.enabled` (ingen overstyring av eksisterende data).

### 2. Sidepanel-layout (`src/pages/Kart.tsx`)
- Dagens "SORA shared header row" beholdes som trigger/toggle (slik at man kan slå av eller skjule panelet), men selve `<SoraSettingsPanel>`-innholdet flyttes til et nytt overlay:
  - På `sm:` og oppover (PC/iPad): et absolutt posisjonert panel **øverst til venstre over kartet**, bredde `w-[33vw] min-w-[320px] max-w-[460px]`, full høyde minus header (`max-h-[calc(100vh-...)]`), `overflow-y-auto`, glass-stil (`bg-card/95 backdrop-blur border border-border rounded-lg shadow-xl`), `z-[1000]` slik at det legger seg over Leaflet.
  - På mobil (`<sm`): behold dagens flyt (panel rendres under header som i dag) for å unngå å dekke kartet.
- Tilstøtende-panelet beholder dagens plassering/oppførsel uendret.

```text
┌─────────────────────────────────────────────┐
│  Header (knapper) + SORA toggle-rad         │
├──────────────┬──────────────────────────────┤
│ SORA panel   │                              │
│ (~1/3, kun   │   Kart                       │
│  desktop/    │                              │
│  tablet)     │                              │
└──────────────┴──────────────────────────────┘
```

### 3. Ny innholdsrekkefølge (`src/components/SoraSettingsPanel.tsx`)
Dagens innhold omorganiseres til denne rekkefølgen øverst-ned:

1. **Buffermetode** (Rute-korridor / Konveks område) – flyttes fra dagens "Manual controls"-seksjon til toppen.
2. **Velg drone** (eksisterende selector + katalog-info-linje).
3. **Flyhøyde (m AGL)** (eksisterende input).
4. **Ekspanderbar seksjon "Andre oppdragsparametere"** (lukket som standard) – inneholder alt som i dag ligger i "Oppdragsparametere"-blokken bortsett fra Flyhøyde:
   - CD, V0, tR, pitch/bank, HAM, SGNSS, SPos, SMap
   - Contingency-metode (+ tP når parachute)
   - GRB-metode (+ glide ratio / descent speed)
   - Vind-overstyring
   - Bruk eksisterende `Collapsible` med en chevron-trigger; tittel "Avanserte parametere".
5. **SORA 2.5-beregning** – uendret kort (Flight geo / SCV / SGRB, detaljer, advarsler).
6. **Manuelle slidere** – Flight Geography Area, Contingency area, Contingency volume høyde, Ground risk buffer, fargeforklaring, SSB befolkningstetthet (uendret, men "Buffermetode" fjernes herfra siden den er flyttet opp).

### 4. Auto-apply ved dronevalg (`src/components/SoraSettingsPanel.tsx`)
- Når `selectedDroneId` endres og det finnes et `suggestion`-resultat, kall en intern `applySuggestion()`-tilsvarende oppdatering automatisk via `useEffect`. Den eksisterende auto-CD/V0-effekten utvides til også å skrive `contingencyDistance`, `contingencyHeight`, `groundRiskDistance` fra `suggestion`, så lenge `manualOverride` er `false`.
- `manualOverride` settes fortsatt til `true` hvis brukeren drar i sliderne, slik at de manuelle verdiene ikke blir overskrevet ved senere re-beregninger.
- Knappen **"Bruk SORA 2.5-beregning"** fjernes (eller skjules), siden anvendelse skjer automatisk. Visningen av selve beregningskortet beholdes som før.
- Ved bytte av drone nullstilles `manualOverride` (slik som i dag) slik at den nye dronens verdier brukes umiddelbart.

---

## Tekniske detaljer

- Filer som endres:
  - `src/pages/Kart.tsx` – default `enabled: true`, `soraOpen: true`, ny sidepanel-container med responsiv klasse, flytte `<SoraSettingsPanel>` ut av dagens flyt på `sm+`.
  - `src/components/SoraSettingsPanel.tsx` – omrokkere JSX, legge "Avanserte parametere" inn i `<Collapsible>`, fjerne "Bruk SORA 2.5-beregning"-knappen, utvide auto-apply-effekten.
- Ingen DB- eller typeendringer; `SoraSettings`-type er uendret.
- Tilgjengelighet: ekspander-seksjonen bruker eksisterende `Collapsible`-komponent og chevron-mønster fra resten av appen.

## Out of scope
- Endringer i selve SORA-beregningen (`soraBufferCalculator.ts`).
- Endringer i Tilstøtende-område-panelet.
- Endringer på mobilvisningens layout for SORA-panelet utover dagens oppførsel.
