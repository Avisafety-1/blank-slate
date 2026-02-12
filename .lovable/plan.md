

# Auto-sett oppdragsstatus til "Pagaende" ved flystart

## Hva endres?

Nar en bruker starter en flytur med et tilknyttet oppdrag, skal oppdragets status automatisk endres fra "Planlagt" til "Pagaende". Endringen reflekteres umiddelbart pa /oppdrag og i MissionDetailDialog via eksisterende realtime-subscription.

## Endringer

### 1. `src/hooks/useFlightTimer.ts` -- Oppdater misjonsstatus ved flystart

Etter at `active_flights`-raden er satt inn (linje ~288), legger vi til en statusoppdatering dersom det er et tilknyttet oppdrag:

```text
// Etter active_flights insert (linje ~300):
if (missionId && navigator.onLine) {
  await supabase
    .from('missions')
    .update({ status: 'Pagaende' })
    .eq('id', missionId)
    .eq('status', 'Planlagt');  // Kun oppdater hvis "Planlagt"
}
```

For offline-modus legges dette til i offline-koeen.

### 2. Oppdater `/oppdrag`-siden automatisk (allerede dekket)

- `useDashboardRealtime` lytter allerede pa `missions`-tabellen
- Oppdrag-siden har realtime-subscription som kaller `fetchMissionsForTab` ved endringer
- Statusendringen propageres automatisk til oppdragskortene

### 3. MissionDetailDialog (allerede dekket)

- Dialogen viser `mission.status` via en Badge
- Nar dataene re-fetches via realtime, oppdateres badgen automatisk

## Hva pavirkes IKKE

- Ingen UI-endringer i komponenter
- Ingen nye database-migrasjoner (missions-tabellen har allerede `status`-kolonnen)
- Ingen endring i RLS-policyer (brukere kan allerede oppdatere egne missions)
- MissionDetailDialog og oppdragskort bruker allerede realtime

## Teknisk detalj

**Fil:** `src/hooks/useFlightTimer.ts`

Eneste endring: Legg til 4-5 linjer etter `active_flights` insert (linje ~300) som oppdaterer misjonens status til "Pagaende" dersom:
1. Det finnes en `missionId`
2. Misjonens navarende status er "Planlagt" (unngaar a overskrive andre statuser)

## Risiko

- **Lav**: `.eq('status', 'Planlagt')` sikrer at kun planlagte oppdrag endres -- pagaende eller fullforte oppdrag pavirkes ikke
- **Lav**: Eksisterende RLS-policyer tillater brukere a oppdatere missions i eget selskap
