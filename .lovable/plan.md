

## Husk valgt drone i SORA + scrollbar-fix

### Problem
1. Valgt drone lagres ikke i SORA-innstillingene — neste gang dialogen åpnes er drone-feltet tomt
2. SORA-panelet i ExpandedMapDialog kan ikke scrolles når innholdet blir langt (f.eks. ved dronevalg)

### Endringer

**1. `src/types/map.ts`** — Legg til `droneId?: string` i `SoraSettings`-interfacet

**2. `src/components/dashboard/ExpandedMapDialog.tsx`**
- Når SORA lagres (`handleSaveSora`): inkludér `soraDroneId` i `soraSettings` som `droneId`
- Initialiser `soraDroneId` fra `route?.soraSettings?.droneId ?? null`

**3. `src/components/SoraSettingsPanel.tsx`**
- Akseptér ny prop `initialDroneId?: string`
- Sett `selectedDroneId` til `initialDroneId` som startverdi og kall `onDroneSelected` ved oppstart

**4. `src/components/dashboard/ExpandedMapDialog.tsx`** — Scroll-fix
- Wrap SORA-panelet + lagre-knappen i en scrollbar-container (`div` med `overflow-y-auto max-h-[40vh]` eller lignende) slik at innholdet kan scrolles når det er for langt

### Teknisk flyt
```text
Lagring: soraSettings.droneId = soraDroneId → missions.route.soraSettings
Åpning: route.soraSettings.droneId → soraDroneId → SoraSettingsPanel(initialDroneId)
```

### Filer som endres
- `src/types/map.ts`
- `src/components/SoraSettingsPanel.tsx`
- `src/components/dashboard/ExpandedMapDialog.tsx`

