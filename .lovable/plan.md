
# Erstatt advarselsdialog med inline oransje blokkering i StartFlightDialog

## Hva skal endres

I dag vises en `AlertDialog` (modal) når brukeren klikker «Start flytur» med ufullstendige sjekklister på oppdraget. Brukeren ønsker i stedet at:

1. **«Start flytur»-knappen er deaktivert** (grå, ikke klikkbar) når det valgte oppdraget har ufullstendige sjekklister
2. **En oransje advarselsboks** vises inline i dialogen (under oppdragsvelgeren) som forklarer at sjekkliste/r må utføres fra oppdragskortet

`AlertDialog` for mission-sjekkliste-advarsel fjernes helt — den erstattes av inline-varselet og deaktivert knapp.

## Detaljert implementasjon

### Fil: `src/components/StartFlightDialog.tsx`

#### 1. Beregn om valgt oppdrag har ufullstendige sjekklister (fra lastet state)

Ny beregnet variabel basert på allerede eksisterende state:

```tsx
const hasMissionIncompleteChecklists =
  missionChecklistIds.length > 0 &&
  missionChecklistIds.some(id => !missionCompletedChecklistIds.includes(id));
```

Denne brukes til å:
- Deaktivere «Start flytur»-knappen
- Vise oransje advarsel i UI

#### 2. Legg til oransje inline advarsel under oppdragsvelgeren

Etter `<div className="space-y-2">` der mission-select er, legges dette til rett under Select-komponenten:

```tsx
{hasMissionIncompleteChecklists && (
  <div className="flex items-start gap-2 rounded-lg bg-orange-500/10 border border-orange-500/30 p-3 text-sm">
    <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
    <p className="text-orange-600 dark:text-orange-400">
      Dette oppdraget har sjekkliste/r som må utføres fra oppdragskortet før du kan starte flytur.
    </p>
  </div>
)}
```

#### 3. Deaktiver «Start flytur»-knappen

Legg til `hasMissionIncompleteChecklists` i `disabled`-prop på knappen (linje ~965):

```tsx
<Button 
  onClick={handleStartFlightClick} 
  disabled={
    loading || 
    isFetchingMissionChecklists || 
    hasMissionIncompleteChecklists ||
    (publishMode === 'live_uav' && (gpsLoading || !gpsPosition))
  }
  className="bg-green-600 hover:bg-green-700"
>
  {isFetchingMissionChecklists ? 'Laster...' : (loading ? t('flight.starting') : ...)}
</Button>
```

#### 4. Fjern `AlertDialog` for mission-sjekkliste-advarsel

`AlertDialog` med `open={showMissionChecklistWarning}` (linje 1052–1070) fjernes helt — den erstattes av den nye inline-boksen.

`showMissionChecklistWarning`-state og `setShowMissionChecklistWarning`-kall i `validateMissionChecklists` kan fjernes, men siden `validateMissionChecklists` nå er en dobbel-sikkerhet i `handleStartFlight`, kan vi beholde den som en no-op (knappen er allerede deaktivert så den aldri trigges).

#### 5. `handleStartFlightClick` — ingen endring nødvendig

Siden knappen er deaktivert når `hasMissionIncompleteChecklists` er `true`, vil `handleStartFlightClick` aldri nås i dette tilfellet. `validateMissionChecklists` i `handleStartFlight` fungerer fortsatt som en siste-linje-forsvar.

## Filer som endres

| Fil | Endring |
|---|---|
| `src/components/StartFlightDialog.tsx` | Legg til `hasMissionIncompleteChecklists`, oransje inline-advarsel under oppdragsvelger, deaktiver knapp, fjern `AlertDialog` for mission-sjekkliste |

## Brukeropplevelse

```
Bruker velger et oppdrag med ufullstendige sjekklister
  → Oransje boks vises umiddelbart under oppdragsvelgeren:
    "Dette oppdraget har sjekkliste/r som må utføres fra
     oppdragskortet før du kan starte flytur."
  → «Start flytur»-knappen er grå og ikke klikkbar
  → Brukeren går til Oppdrag-siden, utfører sjekklistene
  → Kommer tilbake, velger oppdraget igjen
  → Oransje boks forsvinner, knappen er grønn og klikkbar igjen
```

Dersom ingen sjekklister er knyttet til oppdraget, eller alle er fullstendige — ingen endring i opplevelsen.
