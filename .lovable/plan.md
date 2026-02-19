
# Fix: Sjekkliste-blokkering i StartFlightDialog

## Problemet

Brukeren klarte å starte en flytur uten å ha utført sjekklisten som var tilknyttet oppdraget. Årsaken er en **race condition** i `StartFlightDialog.tsx`.

Flyten er:
1. Brukeren velger et oppdrag i dropdown-en
2. En `useEffect` trigges og henter `checklist_ids` og `checklist_completed_ids` fra Supabase **asynkront**
3. Brukeren klikker «Start flytur» raskt — **før** `fetchChecklistState()` er ferdig
4. `missionChecklistIds` er fortsatt `[]` (tomt array fra initialverdien)
5. `missionChecklistIds.some(...)` returnerer `false` siden det er ingen ID-er å iterere over
6. Blokkering skjer ikke — flytur starter

## To problemer som må fikses

**Problem 1 — Race condition:** `missionChecklistIds` er `[]` mens data lastes. Valideringen sjekker dette tomme arrayet og lar flystart gå gjennom.

**Problem 2 — Ingen loading-guard:** Det er ingen tilstand som sier «vi venter på sjekkliste-data» — og «Start flytur»-knappen er aktiv mens data lastes.

## Løsning

### 1. Legg til `isFetchingMissionChecklists`-tilstand

```tsx
const [isFetchingMissionChecklists, setIsFetchingMissionChecklists] = useState(false);
```

### 2. Oppdater `useEffect` som henter sjekkliste-data

Sett `isFetchingMissionChecklists = true` før fetch starter, og `false` når den er ferdig (også ved tom misjon):

```tsx
useEffect(() => {
  if (!selectedMissionId || selectedMissionId === 'none') {
    setMissionChecklistIds([]);
    setMissionCompletedChecklistIds([]);
    setIsFetchingMissionChecklists(false);
    return;
  }
  const fetchChecklistState = async () => {
    setIsFetchingMissionChecklists(true);
    try {
      const { data } = await supabase
        .from('missions')
        .select('checklist_ids, checklist_completed_ids')
        .eq('id', selectedMissionId)
        .single();
      if (data) {
        setMissionChecklistIds((data as any).checklist_ids || []);
        setMissionCompletedChecklistIds((data as any).checklist_completed_ids || []);
      } else {
        setMissionChecklistIds([]);
        setMissionCompletedChecklistIds([]);
      }
    } finally {
      setIsFetchingMissionChecklists(false);
    }
  };
  fetchChecklistState();
}, [selectedMissionId]);
```

### 3. Oppdater `handleStartFlightClick` med dobbel guard

```tsx
const handleStartFlightClick = () => {
  // Vent til sjekkliste-data er hentet
  if (isFetchingMissionChecklists) {
    toast.info('Laster sjekkliste-status, prøv igjen...');
    return;
  }

  if (hasIncompleteChecklists) {
    setShowChecklistWarning(true);
    return;
  }

  const hasMissionIncompleteChecklists = missionChecklistIds.some(
    id => !missionCompletedChecklistIds.includes(id)
  );
  if (hasMissionIncompleteChecklists) {
    setShowMissionChecklistWarning(true);
    return;
  }

  handleStartFlight();
};
```

### 4. Deaktiver «Start flytur»-knappen mens data lastes

I JSX-en, legg til `isFetchingMissionChecklists` som en ekstra `disabled`-betingelse på «Start flytur»-knappen:

```tsx
<Button
  onClick={handleStartFlightClick}
  disabled={loading || isFetchingMissionChecklists}
  ...
>
  {isFetchingMissionChecklists ? 'Laster...' : t('flight.start')}
</Button>
```

### 5. Nullstill ved dialog-lukking

I `useEffect` som kjøres når `open` blir `false`, legg til:
```tsx
setIsFetchingMissionChecklists(false);
```

## Filer som endres

| Fil | Endring |
|---|---|
| `src/components/StartFlightDialog.tsx` | Legg til `isFetchingMissionChecklists`-tilstand, oppdater fetch-useEffect, oppdater `handleStartFlightClick`, deaktiver knapp under loading |

## Visuell effekt

- Mens oppdrags-sjekkliste-data lastes: «Start flytur»-knappen viser «Laster...» og er deaktivert
- Når data er lastet og sjekklister er ufullstendige: advarselsdialog vises som planlagt
- Race condition elimineres — det er ikke lenger mulig å komme seg forbi sjekkliste-sjekken
