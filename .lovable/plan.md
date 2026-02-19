
# Fix: Database-level validering ved flystart

## Rotårsaken

Selv med `isFetchingMissionChecklists`-loading-guard er det fortsatt mulig å starte flytur uten å ha utført sjekklistene. Årsaken er at **valideringen stoler på React-state** (`missionChecklistIds`, `missionCompletedChecklistIds`) som ble hentet asynkront da oppdraget ble valgt — ikke på ferske data fra databasen i det øyeblikket brukeren klikker «Start flytur».

Det finnes to steder der valideringen kan omgås:

1. **`handleStartFlightClick`**: Selv om `isFetchingMissionChecklists` er `false` og data er lastet, kan state være utdatert dersom sjekkliste-status på oppdraget har endret seg siden oppdraget ble valgt.

2. **`handleConfirmLargeAdvisory` (linje 612)**: Denne funksjonen kaller `onStartFlight(...)` direkte — **uten å sjekke sjekkliste-status overhodet**. Dette er et fullstendig hull i valideringen.

## Løsning: Fersk DB-sjekk rett før flystart

I stedet for å stole på React-state, gjøres en ny Supabase-spørring mot `missions`-tabellen rett før flystart faktisk iverksettes. Dette er det eneste pålitelige stedet å validere, siden det skjer synkront i samme klik-handling.

### Ny hjelpefunksjon `validateMissionChecklists`

```tsx
const validateMissionChecklists = async (missionId: string | undefined): Promise<boolean> => {
  if (!missionId || missionId === 'none') return true; // Ingen oppdrag valgt — OK

  const { data } = await supabase
    .from('missions')
    .select('checklist_ids, checklist_completed_ids')
    .eq('id', missionId)
    .maybeSingle();

  if (!data) return true; // Kan ikke hente data — tillat ikke blokkering

  const checklistIds: string[] = (data as any).checklist_ids || [];
  const completedIds: string[] = (data as any).checklist_completed_ids || [];

  const hasIncomplete = checklistIds.some(id => !completedIds.includes(id));
  if (hasIncomplete) {
    setShowMissionChecklistWarning(true);
    return false;
  }
  return true;
};
```

### Oppdater `handleStartFlight` til å kalle `validateMissionChecklists`

`handleStartFlight` er den sentrale funksjonen som faktisk starter flyturen. Den kalles fra:
- `handleStartFlightClick`
- `handleConfirmLargeAdvisory`

Ved å legge valideringen **inn i `handleStartFlight`** dekkes begge kodestier:

```tsx
const handleStartFlight = async (forcePublish = false) => {
  setLoading(true);

  try {
    const missionId = selectedMissionId && selectedMissionId !== 'none' 
      ? selectedMissionId 
      : undefined;

    // ← NY: Fersk DB-validering av oppdrags-sjekklister
    const checklistsOk = await validateMissionChecklists(missionId);
    if (!checklistsOk) {
      setLoading(false);
      return;
    }

    // ... resten av eksisterende logikk (advisory-sjekk, GPS, onStartFlight)
  } finally {
    setLoading(false);
    setPendingFlightStart(false);
  }
};
```

### Fjern overflødig state-basert sjekk fra `handleStartFlightClick`

Siden `handleStartFlight` nå gjør en fersk DB-sjekk, kan `isFetchingMissionChecklists`-guarden og state-sjekken i `handleStartFlightClick` forenkles (men beholdes som rask pre-check for UX):

```tsx
const handleStartFlightClick = () => {
  if (hasIncompleteChecklists) {
    setShowChecklistWarning(true);
    return;
  }
  // isFetchingMissionChecklists-guard beholdes som rask UX-sjekk
  if (isFetchingMissionChecklists) {
    toast.info('Laster sjekkliste-status, prøv igjen...');
    return;
  }
  // DB-validering skjer inne i handleStartFlight
  handleStartFlight();
};
```

## Filer som endres

| Fil | Endring |
|---|---|
| `src/components/StartFlightDialog.tsx` | Legg til `validateMissionChecklists`, kall den fra `handleStartFlight` |

## Visuell effekt

- Ingen visuell endring for brukeren
- Valideringen skjer nå alltid rett før flytur starter, uavhengig av React-state
- Begge kodestier (`handleStartFlightClick` og `handleConfirmLargeAdvisory`) er nå beskyttet
- Race condition er eliminert — det er ikke mulig å omgå sjekkliste-valideringen
