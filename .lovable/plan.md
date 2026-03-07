

## Buggfix: Lagre inspeksjonstidspunkt med klokkeslett

### Rotårsak
`sist_inspeksjon` lagres som en ren dato (`2026-03-07`), som tolkes som midnatt (`2026-03-07T00:00:00`). Men `flight_date` i `flight_logs` lagres som full timestamp (f.eks. `2026-03-07T06:30:00`). Når vi filtrerer `flight_date > sist_inspeksjon`, blir alle flyvninger på inspeksjonsdagen telt med fordi de har tidsstempel etter midnatt -- selv om inspeksjonen ble utført etter flyvningene.

### Løsning

#### 1. Database: Endre `sist_inspeksjon` til timestamptz
- Migrasjon: `ALTER TABLE drones ALTER COLUMN sist_inspeksjon TYPE timestamptz USING sist_inspeksjon::timestamptz`
- Eksisterende dato-verdier konverteres automatisk til midnatt UTC

#### 2. DroneDetailDialog.tsx -- Lagre full timestamp ved inspeksjon
- Linje 736: Endre `const today = new Date().toISOString().split('T')[0]` til `const today = new Date().toISOString()` (full ISO-string med tid)
- Linje 747: `sist_inspeksjon: today` sender nå full timestamp
- Samme endring i sjekkliste-inspeksjon-handleren (ca. linje 1490)

#### 3. DroneDetailDialog.tsx -- Visning av sist_inspeksjon
- Vis dato+tid i view-mode (linje ~783): Bruk `format(date, "dd.MM.yyyy HH:mm")` i stedet for bare dato
- Edit-mode (linje ~161): Behold date-input men aksepter at lagret verdi har tid

#### 4. useStatusData.ts og Resources.tsx
- Queryen `.gt("flight_date", drone.sist_inspeksjon)` fungerer nå korrekt fordi `sist_inspeksjon` inneholder eksakt tidspunkt

#### 5. Oppdater types.ts-kommentar
- Ingen manuell endring nødvendig -- filen regenereres automatisk etter migrasjonen

### Berørte filer
- Database-migrasjon (sist_inspeksjon → timestamptz)
- `src/components/resources/DroneDetailDialog.tsx`

