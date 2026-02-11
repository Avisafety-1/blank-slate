

# Ny widget: Aktive flyturer i selskapet

## Oversikt
Legge til en ny dashboard-widget som viser pågående/aktive flyturer i selskapet. Widgeten henter data fra `active_flights`-tabellen, viser dem som klikkbare kort (samme stil som "Kommende oppdrag"), og inkluderer en "Vis på kart"-knapp.

## Plassering

**Desktop/tablet (lg+):**
- I midtkolonnen, mellom start/avslutt-knappene og "Kommende oppdrag"-boksen
- Vises alltid (tom-tilstand med melding hvis ingen aktive flyturer)

**Mobil:**
- Under start/avslutt flytur-knappene
- Skjules helt hvis det ikke er aktive flyturer i selskapet

## Implementasjon

### 1. Ny komponent: `src/components/dashboard/ActiveFlightsSection.tsx`
- Henter `active_flights` fra Supabase, filtrert på `company_id`
- Joiner med `profiles` (pilotnavn) og `missions` (oppdragstittel) for visning
- Sanntidsoppdatering via `postgres_changes`-subscription på `active_flights`
- Hvert kort viser: pilotnavn, starttidspunkt, varighet (beregnet fra `start_time`), tilknyttet oppdrag, og publiseringsmodus
- Klikkbart kort navigerer til `/kart` for å se flyturen
- "Vis på kart"-knapp nederst navigerer til `/kart`
- Bruker `GlassCard` med samme layout-stil som `MissionsSection`

### 2. Oppdater `src/pages/Index.tsx`
- Importer `ActiveFlightsSection`
- **Desktop**: Plasser widgeten i midtkolonnen etter flight-knappene, før missions-blokken
- **Mobil**: Plasser etter start/avslutt-knappene, wrappet i en betinget visning som kun rendrer hvis det finnes aktive flyturer

### 3. Oversettelser
- Legg til nøkler i `en.json` og `no.json` under `dashboard.activeFlights`

## Tekniske detaljer

- Spørring: `supabase.from('active_flights').select('*, profiles:profile_id(full_name), missions:mission_id(tittel)')` med filter på company
- Sanntids-subscription på `active_flights`-tabellen for INSERT/DELETE events
- Elapsed time beregnes client-side fra `start_time` med `setInterval` (oppdateres hvert sekund)
- "Vis på kart"-knapp bruker `useNavigate` til `/kart`
- Widgeten er ikke del av DndContext/draggable layout -- den er fast plassert i midtkolonnen
- Mobil: bruker en state `hasActiveFlights` som styrer `lg:hidden`/skjul-logikken

