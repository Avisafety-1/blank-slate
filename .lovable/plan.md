## Endringer i `PersonCompetencyDialog.tsx`

### 1. Topp-knappelinje (ved siden av "Loggbok")
Flytt "Legg til kompetanse" fra bunnen av kortet opp til DialogHeader. Knappene plasseres side-ved-side (på mobil under hverandre):
- Loggbok (eksisterende)
- Legg til kompetanse (ny — åpner et dialogvindu med skjemaet som i dag ligger nederst)

Selve "Legg til"-skjemaet (linje 769–...) flyttes ut i en egen liten Dialog-komponent som åpnes av den nye knappen. Skjema-state og `handleAddCompetency` beholdes uendret.

### 2. Ny KPI-seksjon "Flytid" (under knappelinjen)
Tre kort side-ved-side (mobil: stablet) som viser sum flytid for personen i tre perioder. Standard: 30 / 90 / 180 dager.

- Henter `flight_logs` filtrert på `profile_id = person.id` og `flight_date >= now - N dager`, summerer `flight_duration_minutes`.
- Vises som tall (timer + minutter) + en liten sparkline/bar (recharts) som viser daglig/ukentlig fordeling i perioden for visuell kontekst.
- Liten blyant-ikon (Pencil) øverst i seksjonen åpner en popover hvor brukeren kan endre de tre periodene (tall i dager). Verdiene lagres lokalt i `localStorage` per bruker (nøkkel: `personnel-kpi-periods`) inntil selskapsinnstilling lages senere.

### 3. Layout-rekkefølge i dialogen
```
Header: Navn
        [Loggbok]  [Legg til kompetanse]
KPI-flytid: [30d] [90d] [180d]   ✎
Kompetanser-liste
Tilgjengelige kurs
(skjema for legg til er fjernet fra bunnen)
```

## Tekniske detaljer

- Ny komponent `PersonnelFlightKpi.tsx` i `src/components/resources/` som tar `personId` som prop, henter data og rendrer de tre kortene + edit-popover. Bruker `recharts` BarChart (allerede brukt i prosjektet, se `KPIChart.tsx`).
- Spørring: `supabase.from('flight_logs').select('flight_date, flight_duration_minutes').eq('profile_id', personId).gte('flight_date', cutoff)`.
- Aggregering: grupper per uke for sparkline, sum totalt for stort tall.
- Periode-state: `useState<[number, number, number]>([30, 90, 180])`, persistert i `localStorage`.
- "Legg til kompetanse"-dialog: enkel `Dialog` som wrapper det eksisterende skjemaet 1:1. `handleAddCompetency` lukker dialogen ved suksess.
- Ingen DB-/RLS-endringer nødvendig.
