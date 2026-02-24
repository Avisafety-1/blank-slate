

# Fix: SHA-256 duplikatsjekk kjores for sent i flyten

## Problem

Brukeren har slettet oppdragene fra `/oppdrag`, men de tilhorende `flight_logs`-radene med `dronelog_sha256` ligger fortsatt i databasen (foreldrelose). Flyten blir:

1. `findMatchingFlightLog` soker etter logger pa riktig dato, men finner ingen match (fordi oppdraget/mission er slettet, sa `missions.tidspunkt` er null)
2. Brukeren ser "Ingen eksisterende flylogg matcher"
3. Brukeren trykker "Opprett nytt oppdrag"
4. `handleCreateNew` kjorer `checkDuplicate` via SHA-256 og finner den foreldrelose flight_log-raden
5. Blokkerende feilmelding uten mulighet til a ga videre

## Losning

Flytt SHA-256-sjekken til starten av `findMatchingFlightLog`. Hvis en eksisterende flight_log med samme hash finnes, sett den som `matchedLog` direkte -- uavhengig av om oppdraget fortsatt eksisterer. Fjern den blokkerende sjekken fra `handleCreateNew`.

## Endringer

**Fil: `src/components/UploadDroneLogDialog.tsx`**

### 1. Legg til SHA-256 oppslag i `findMatchingFlightLog` (linje 407-409)

For dato-matchingen, sjekk om `data.sha256Hash` allerede finnes i `flight_logs`. Hvis ja, hent raden og sett `matchedLog` direkte med en info-toast. Return tidlig.

```typescript
// Etter linje 408 (if (!companyId) return;)
if (data.sha256Hash) {
  const { data: dupMatch } = await (supabase
    .from('flight_logs')
    .select('id, flight_date, flight_duration_minutes, drone_id, mission_id, missions(tittel, tidspunkt)')
    .eq('company_id', companyId) as any)
    .eq('dronelog_sha256', data.sha256Hash)
    .limit(1)
    .maybeSingle();
  if (dupMatch) {
    setMatchedLog(dupMatch as any);
    toast.info('Flyloggen er allerede importert. Du kan oppdatere den eksisterende.');
    return;
  }
}
```

### 2. Fjern blokkerende SHA-256 sjekk fra `handleCreateNew` (linje 630-638)

Fjern hele `checkDuplicate`-blokken fra `handleCreateNew`. SHA-256-matchen handteres na i `findMatchingFlightLog`, sa brukeren aldri nar `handleCreateNew` med en duplikat.

Resultatet: brukeren ser "Flyloggen er allerede importert" med mulighet til a oppdatere, i stedet for a bli blokkert uten handlingsalternativ.

