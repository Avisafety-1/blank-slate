

# Bakgrunnslasting av fullforte oppdrag

## Hva endres?

Nar brukeren lander pa `/oppdrag`, lastes "Pagaende og kommende" forst (som i dag). Samtidig starter en bakgrunnshenting av "Fullforte" oppdrag -- slik at nar brukeren klikker pa fanen, er dataene allerede klare uten ny lasting.

## Strategi

I dag styrer `filterTab` bade hvilken fane som vises OG hvilket Supabase-kall som kjores. Vi endrer til:

1. **To separate state-variabler**: `activeMissions` og `completedMissions`
2. **To separate hente-funksjoner**: `fetchActiveMissions()` og `fetchCompletedMissions()`
3. **Prioritert lasting**: `fetchActiveMissions()` kjores forst. Nar den er ferdig, starter `fetchCompletedMissions()` automatisk i bakgrunnen
4. **Fanevalg styrer kun visning**: `filterTab` bestemmer hvilken liste som vises, uten a trigge ny henting
5. **Cache per tab**: Eksisterende offline-cache per tab fungerer som for

## Flyt

```text
Bruker lander pa /oppdrag
  |
  v
fetchActiveMissions()  -->  Viser "Pagaende og kommende" umiddelbart
  |
  v (nar ferdig)
fetchCompletedMissions()  -->  Lagrer i completedMissions state (bakgrunn)
  |
  v
Bruker klikker "Fullforte"  -->  Data vises umiddelbart, ingen spinner
```

## Hva pavirkes

- Fane-bytte trigger IKKE lenger ny henting (fjerner `filterTab` fra useEffect-dependency)
- Nar bruker gjor endringer (redigerer, sletter, legger til oppdrag), oppdateres riktig liste
- Realtime-subscription dekker begge statusfiltre

## Teknisk detalj

**Fil:** `src/pages/Oppdrag.tsx`

### State-endringer
- `missions` -> splittes til `activeMissions` + `completedMissions`
- `isLoading` -> splittes til `isLoadingActive` + `isLoadingCompleted`
- Ny computed variabel: `missions = filterTab === 'active' ? activeMissions : completedMissions`
- Ny computed variabel: `isLoading = filterTab === 'active' ? isLoadingActive : isLoadingCompleted`

### useEffect-endring (linje 196-200)
- Fjern `filterTab` fra dependency-arrayet
- Kall `fetchActiveMissions()` forst, deretter `fetchCompletedMissions()` nar den er ferdig

### fetchMissions() -> to funksjoner
- `fetchActiveMissions()`: Identisk med dagens logikk men hardkodet `.in("status", ["Planlagt", "Pagaende"])`
- `fetchCompletedMissions()`: Identisk men hardkodet `.eq("status", "Fullfort")`
- Begge bruker sin egen cache-noekkel (`offline_missions_${companyId}_active` / `_completed`)

### Oppdaterings-handlere
- `handleMissionUpdated`, `handleMissionAdded`, etc. kaller begge fetch-funksjoner for a holde begge lister oppdatert

### Realtime-subscription (linje 202-243)
- Fjern `filterTab` fra dependency
- Subscription-handleren kaller begge fetch-funksjoner

### Visningslogikk
- Alt som bruker `missions` i dag fortsetter a fungere via den computed variabelen
- Ingen endring i JSX-rendering eller kortkomponenter

## Risiko

- **Lav**: Dobbel datamengde i minnet (aktive + fullforte), men dette er allerede begrenset av RLS og selskapstilhorighet
- **Lav**: To bakgrunnskall i stedet for ett, men de kjorer sekvensielt sa de belaster ikke serveren mer enn i dag
