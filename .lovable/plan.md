

## Fiks: Avdelinger arver ikke FH2-tilkobling fra morselskap

### Problem

Frontend-sjekken for FH2-tilkobling sjekker kun det aktive selskapet -- ikke morselskapet. Edge-funksjonen (`flighthub2-proxy`) har allerede parent-fallback, men UI-en skjuler knappene fordi den ikke finner credentials.

To steder trenger fiks:

1. **`Kart.tsx`** (linje 127-134): Bruker fortsatt den gamle `companies.flighthub2_token`-kolonnen i stedet for `company_fh2_credentials`-tabellen. Sjekker ikke parent.
2. **`Oppdrag.tsx`** (linje 70-77): Bruker riktig tabell men sjekker kun `authCompanyId`, ikke parent.

### Løsning

Begge steder: Sjekk først om nåværende selskap har credentials. Hvis ikke, hent `parent_company_id` og sjekk om parent har credentials.

**`src/pages/Kart.tsx`**
- Erstatt `companies.flighthub2_token`-sjekken med en sjekk mot `company_fh2_credentials`-tabellen
- Legg til parent-fallback: hent `parent_company_id` fra `companies`, sjekk parent credentials hvis eget selskap ikke har

**`src/pages/Oppdrag.tsx`**
- Legg til parent-fallback med samme logikk: sjekk `parent_company_id` og deretter parent credentials

### Filer som endres
1. `src/pages/Kart.tsx` -- oppdater FH2-tilkoblingssjekk med parent-arv
2. `src/pages/Oppdrag.tsx` -- legg til parent-fallback i FH2-sjekk

