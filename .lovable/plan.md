

# Fiks OpenAIP RMZ/TMZ/ATZ-synkronisering

## Problem
Edge-funksjonen `sync-openaip-airspaces` henter 120 luftrom fra OpenAIP, men ingen av dem er RMZ, TMZ eller ATZ. Samtidig dukker CTR-soner (som vi IKKE ba om) opp i resultatene. Dette tyder paa at `type`-filteret i API-kallet ikke fungerer korrekt, eller at type-verdiene er annerledes enn antatt.

Geiteryggen RMZ finnes i OpenAIP (identifikator "NOGEITERYGGEN RMZ"), saa dataen ER tilgjengelig - vi henter den bare ikke.

## Loesung

### Steg 1: Fjern type-filter og logg faktiske typer
Endre edge-funksjonen til aa hente ALLE luftrom for Norge (uten `type`-parameter), og logge den faktiske `type`-verdien for hvert luftrom. Dette gir oss oversikt over hvilke type-verdier som faktisk brukes.

### Steg 2: Filtrer paa applikasjonssiden
I stedet for aa stole paa API-ets type-filter, hent alle luftrom og filtrer i koden:
- Behold eksisterende typer (P, R, D) - type 1-5
- Legg til RMZ, TMZ, ATZ - uansett hvilken type-verdi de har
- Ekskluder CTR (type 6) og TMA (type 7) som allerede dekkes av ArcGIS
- Ekskluder FIR, UIR og andre irrelevante typer

### Steg 3: Forbedre type-mapping
Utvid typeMap basert paa faktiske verdier fra API-et. Legg til logging som viser:
- Antall per type-verdi
- Navn paa luftrom per type
- Hvilke som ble synkronisert vs. filtrert bort

## Tekniske endringer

### `supabase/functions/sync-openaip-airspaces/index.ts`
- Fjern `&type=1,2,3,4,5,8,9,13` fra API URL
- Legg til type-statistikk-logging (teller per type-verdi)
- Filtrer ut uoenskede typer (CTR/TMA/FIR etc.) ETTER henting
- Utvid typeMap basert paa hva API-et faktisk returnerer
- Fikse zone_id-regex til aa ogsaa matche RMZ/TMZ/ATZ navneformat (f.eks. "NOGEITERYGGEN RMZ" -> bruk openaip_id)

### Ingen andre filer endres
Resten av systemet (kart, advarsler, database) er allerede satt opp for RMZ/TMZ/ATZ fra forrige implementasjon.

## Forventet resultat
Etter deploy og ny sync vil Geiteryggen RMZ og andre RMZ/TMZ/ATZ-soner dukke opp i databasen og vises paa kartet med riktig styling.
