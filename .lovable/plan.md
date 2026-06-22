## Problemet

Etter at vi gjorde manuelle timer om til ekte `flight_logs`-rader, faller de inn under **samme sum** som logførte flyturer. Derfor viser «Fra loggførte flyturer» og «Manuelt lagt til» nøyaktig samme tall, og begge vokser når du legger til manuelt.

## Løsning: eksplisitt skille mellom manuell og logført

### 1. Database (migrasjon)
Legg til kolonne `entry_source TEXT NOT NULL DEFAULT 'logged'` i `flight_logs`, med constraint `CHECK (entry_source IN ('logged','manual'))`.

Backfill eksisterende rader:
- `entry_source = 'manual'` der `drone_id IS NULL` og `notes ILIKE 'Manuelt lagt til%' OR notes ILIKE 'Startbalanse%'`
- Alt annet beholder default `'logged'`

Index: `CREATE INDEX flight_logs_entry_source_idx ON flight_logs(entry_source);`

### 2. `FlightLogbookDialog.tsx` — innleggingsflyt
I `handleAddManualHours`, sett `entry_source: 'manual'` på den nye `flight_logs`-raden.

### 3. `FlightLogbookDialog.tsx` — visning
I `fetchFlightLogs`, hent også `entry_source`. Beregn:
- `loggedMinutes` = sum av logger der `entry_source = 'logged'`
- `manualMinutes` = sum av logger der `entry_source = 'manual'`
- `totalFlytid = loggedMinutes + manualMinutes`

Vis:
```
Total flytid: <total>
Fra loggførte flyturer: <loggedMinutes>
Manuelt lagt til:       <manualMinutes>
```

### 4. PDF-eksport
Samme tre tall. Manuelle rader vises i en egen tabellseksjon eller med en «Manuell»-tag i eksisterende tabell, så piloten kan dokumentere kilden.

### 5. «Flyturer»-tab i dialogen
Vis en liten badge `Manuell` på rader med `entry_source = 'manual'` så det er åpenbart hva som er hva.

### 6. AI risk assessment + andre lesere
`flight_log_personnel`-join blir uendret — alle timer telles fortsatt likt for currency/erfaring. `entry_source` brukes kun til visuell splitting i loggboken og PDF.

## Hva som IKKE endres

- `profiles.flyvetimer` — fortsatt sum av alle timer (logged + manual), autoritativ.
- Triggers — uendret. `entry_source` påvirker ikke beregningen.
- Currency-regler — manuelle timer teller fortsatt med (slik de gjorde før).

## Verifisering

1. Åpne Gards loggbok → «Fra loggførte flyturer» og «Manuelt lagt til» skal nå være ulike (basert på backfill).
2. Klikk «Legg til flytimer manuelt» → 1t → kun «Manuelt lagt til» øker.
3. En reell DJI-logg-sync → kun «Fra loggførte flyturer» øker.
4. «Flyturer»-listen viser `Manuell`-badge der relevant.

Godkjenn så starter jeg med migrasjonen.