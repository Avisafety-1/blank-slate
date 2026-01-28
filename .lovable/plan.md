
# Plan: Utvide søkefunksjonaliteten

## Problemanalyse

Gjennomgang av søkefunksjonen avdekket flere mangler:

1. **Personell/profiler er ikke søkbare** - Kan ikke finne personer på navn, e-post eller tittel
2. **Kompetansesøk mangler company-filter** - Søker i alle kompetanser globalt, ikke bare egen bedrift
3. **Kunder er ikke søkbare** - Kundedata er ikke inkludert i søk
4. **Nyheter er ikke søkbare** - Nyhetsartikler mangler i søkeresultater
5. **Flylogger er ikke søkbare** - Loggført flytid med lokasjoner er ikke søkbart
6. **Kalenderhendelser er ikke søkbare** - Egendefinerte hendelser kan ikke finnes
7. **Oppdrag søker kun på tittel** - Bør også søke i beskrivelse og lokasjon
8. **Droner har feil kolonnenavn** - Bruker `registrering` men kolonnen heter `serienummer`

## Løsning

### Backend (Edge Function)

Oppdater `supabase/functions/ai-search/index.ts`:

1. **Legg til profiler/personellsøk:**
   - Søk på `full_name`, `email`, `tittel`
   - Filtrer på `company_id`

2. **Fiks kompetansesøk:**
   - Legg til join med profiler for å filtrere på company_id

3. **Legg til kundesøk:**
   - Søk på `navn`, `kontaktperson`, `epost`, `adresse`

4. **Legg til nyhetssøk:**
   - Søk på `tittel`, `innhold`

5. **Legg til flyloggsøk:**
   - Søk på `departure_location`, `landing_location`, `notes`

6. **Legg til kalendersøk:**
   - Søk på `title`, `description`

7. **Forbedre eksisterende søk:**
   - Oppdrag: Legg til `beskrivelse`, `lokasjon` i søket
   - Droner: Rett `registrering` til `serienummer`

8. **Oppdater AI-oppsummering** med alle nye kategorier

### Frontend (AISearchBar.tsx)

1. **Utvid SearchResults interface** med nye kategorier
2. **Legg til visning av nye resultater:**
   - Personell - klikk åpner PersonCompetencyDialog
   - Kunder - visning med kontaktinfo
   - Nyheter - klikk åpner NewsDetailDialog
   - Flylogger - visning med dato/lokasjon
   - Kalender - visning med dato
3. **Legg til nødvendige dialogs og handlers**

## Teknisk oversikt

```text
+------------------+     +------------------+
|   AISearchBar    |     |   ai-search      |
|   (Frontend)     | --> |   (Edge Function)|
+------------------+     +------------------+
         |                        |
         v                        v
+------------------+     +------------------+
| Viser resultater |     | Søker i tabeller:|
| for alle         |     | - profiles       |
| kategorier       |     | - customers      |
+------------------+     | - news           |
                         | - flight_logs    |
                         | - calendar_events|
                         | + eksisterende   |
                         +------------------+
```

## Filer som endres

| Fil | Endring |
|-----|---------|
| `supabase/functions/ai-search/index.ts` | Legg til søk i 5 nye tabeller, fiks eksisterende søk |
| `src/components/dashboard/AISearchBar.tsx` | Vis nye kategorier, legg til click handlers |

## Nye søkbare kategorier

| Kategori | Søkefelt | Klikkbar |
|----------|----------|----------|
| Personell | navn, e-post, tittel | Ja (åpner kompetansekort) |
| Kunder | navn, kontaktperson, e-post | Nei (visning) |
| Nyheter | tittel, innhold | Ja (åpner nyhet) |
| Flylogger | avgang, landing, notater | Nei (visning) |
| Kalender | tittel, beskrivelse | Nei (visning) |

## Forbedringer av eksisterende søk

| Kategori | Før | Etter |
|----------|-----|-------|
| Oppdrag | tittel | tittel, beskrivelse, lokasjon |
| Droner | modell, registrering (feil) | modell, serienummer |
| Kompetanse | ingen company-filter | filtrert på company via join |
