

# Forbedre AI internt sok - manglende felt og relasjoner

## Problem

Nar du soker pa "gard" i det interne soket, finner det ikke oppdrag der "gard" finnes i felt som ikke er inkludert i soket. Soket har flere hull:

### Navaerende begrensninger i `supabase/functions/ai-search/index.ts`:

| Tabell | Felt som sokes | Felt som mangler |
|---|---|---|
| Missions | tittel, beskrivelse, lokasjon | merknader, kundenavn (via customer_id), tilknyttet personell (via mission_personnel) |
| Incidents | tittel, beskrivelse | lokasjon, kategori |
| Documents | tittel, beskrivelse | kategori (finnes men sokes ikke pa riktig mate) |
| Equipment | navn, serienummer | type, merknader |
| Drones | modell, serienummer | merknader |
| Flight Logs | departure_location, landing_location, notes | drone-modell, pilotnavn |

### Hovedproblemet med "gard"-soket

Brukeren "Gard Haug-Hansen" er tilknyttet mange oppdrag via `mission_personnel`-tabellen. Nar man soker "gard":
- Personell-resultater viser riktig (full_name matcher)
- Men oppdrag som Gard er tilknyttet dukker IKKE opp, fordi soket bare ser pa tittel/beskrivelse/lokasjon

## Losning

Oppdatere edge-funksjonen `supabase/functions/ai-search/index.ts` med folgende forbedringer:

### 1. Utvide feltene som sokes i eksisterende tabeller
- Missions: legg til `merknader` i or-filteret
- Incidents: legg til `lokasjon` i or-filteret
- Equipment: legg til `merknader` i or-filteret
- Drones: legg til `merknader` i or-filteret

### 2. Legge til relasjonsbasert sok for oppdrag
- Nar personell-soket finner treff (f.eks. "Gard Haug-Hansen"), gjor et oppslag i `mission_personnel` for a finne oppdrag knyttet til de matchende personene
- Nar kunde-soket finner treff, gjor et oppslag for a finne oppdrag med matchende `customer_id`
- Sla sammen disse resultatene med de direkte mission-treffene (fjern duplikater)

### 3. Implementasjonsdetaljer

I edge-funksjonen, etter at de parallelle sokene er ferdige:

```text
1. Sjekk om personnel-soket ga treff
2. Hvis ja: hent mission_personnel-rader for matchende profile_ids
3. Hent missions for disse mission_ids
4. Sjekk om customer-soket ga treff
5. Hvis ja: hent missions med matchende customer_ids
6. Sla sammen alle mission-treff og fjern duplikater
```

## Fil som endres

| Fil | Endring |
|---|---|
| `supabase/functions/ai-search/index.ts` | Utvide sok-felt, legge til relasjonsbasert sok for oppdrag via personell og kunder |

