

## Støtte for bildebaserte sjekklister

### Oversikt
Når et dokument lastes opp med kategori «sjekklister» og har en fil (bilde), skal det kunne velges overalt der sjekklister velges i dag. Ved utførelse vises bildet i stedet for avkrysningspunkter, og brukeren markerer sjekklisten manuelt som utført via en knapp.

### Hvordan det fungerer
- Eksisterende sjekklister har JSON-data i `beskrivelse`-feltet → viser avkrysningsliste
- Nye bildebaserte sjekklister har `fil_url` satt og ingen/ugyldig JSON i `beskrivelse` → viser bildet
- Deteksjon: Når `ChecklistExecutionDialog` henter data, sjekk om `beskrivelse` er gyldig JSON med items. Hvis ikke, og `fil_url` finnes, vis bildemodus

### Endringer

**`src/components/resources/ChecklistExecutionDialog.tsx`**
- Hent `fil_url` i tillegg til `beskrivelse` fra documents-tabellen
- Ny state: `imageUrl` (string | null) for signert URL til bildefilen
- Ny state: `manuallyCompleted` (boolean) for manuell markering
- Logikk: Hvis `beskrivelse` ikke kan parses som JSON-array OG `fil_url` finnes → generer signert URL, sett `imageUrl`, vis bildemodus
- **Bildemodus UI**: Vis bildet (zoombart/scrollbart), med en «Marker som utført»-knapp i bunnen. Ingen progressbar eller avkrysningsliste
- **Fullfør-knapp**: Aktiveres kun når `manuallyCompleted` er true
- Eksisterende JSON-modus forblir uendret

**`src/hooks/useChecklists.ts`**
- Ingen endring nødvendig — henter allerede alle dokumenter med `kategori: "sjekklister"`, uavhengig av om de har fil eller JSON-innhold

### Ingen andre filer endres
Velgere (AddDroneDialog, AddMissionDialog, StartFlightDialog) bruker allerede `useChecklists` og sender ID-er til `ChecklistExecutionDialog` — de trenger ingen endring.

### Fil som endres
1. **`src/components/resources/ChecklistExecutionDialog.tsx`** — Legg til bildemodus med manuell markering

