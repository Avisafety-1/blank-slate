

## «Sist flydd»-dato på droner + sortering

### Oversikt
Vis dato for siste loggede flytur på dronekortet (både på /ressurser-listen og i DroneDetailDialog). Legg til sorteringsfunksjon i droneseksjonen.

### Datahenting

Sist flydd hentes fra `flight_logs`-tabellen. I `fetchDrones` i Resources.tsx, etter at dronene er hentet, gjør en samlet spørring for å finne nyeste `flight_date` per drone:

```sql
SELECT drone_id, MAX(flight_date) as last_flown
FROM flight_logs
WHERE drone_id IN (...)
GROUP BY drone_id
```

Resultatet merges inn som `last_flown` på hvert drone-objekt.

### UI-endringer

**`src/pages/Resources.tsx`**
- I `fetchDrones`: hent siste flytur-dato fra `flight_logs` og legg til `last_flown` på hvert drone-objekt
- Ny state `droneSortBy` med verdier `"default"` | `"last_flown"`
- Legg til en sorteringsvelger i filter-raden (ved siden av modell/status-filtere)
- Vis «Sist flydd: dd.MM.yyyy» som ny rad **over** flyvetimer i dronekortet på listen
- Sortering på «Sist flydd» sorterer nyeste først (droner uten flytur sist)

**`src/components/resources/DroneDetailDialog.tsx`**
- Hent `last_flown` fra `flight_logs` når dialogen åpnes
- Vis «Sist flydd: dd.MM.yyyy» under flyvetimer/status-seksjonen i visningsmodusen

**`src/components/dashboard/DroneListDialog.tsx`**
- Vis «Sist flydd» i grid-infoen på dronekortet (samme mønster som Resources)

### Ingen databaseendringer
All data finnes allerede i `flight_logs`-tabellen.

### Filer som endres
1. `src/pages/Resources.tsx` — hent last_flown, vis i liste, legg til sortering
2. `src/components/resources/DroneDetailDialog.tsx` — vis last_flown i detalj-visning
3. `src/components/dashboard/DroneListDialog.tsx` — vis last_flown i status-dialogen

