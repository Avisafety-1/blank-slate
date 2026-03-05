

## Formater dato og varighet i «Eksisterende flylogg funnet»

### Problem
Linje 1753 viser `matchedLog.flight_date` rått fra databasen (ISO-format `2020-10-06T00:00:00+00:00`) i stedet for et lesbart format. Brukeren ser en kryptisk streng.

### Løsning

**`src/components/UploadDroneLogDialog.tsx`** — linje 1752-1755

Formater `matchedLog.flight_date` med `format()` fra `date-fns` til `dd.MM.yyyy` (norsk datoformat). Filen importerer allerede `date-fns`.

Erstatt:
```
{matchedLog.flight_date} — {matchedLog.flight_duration_minutes} min
{matchedLog.missions ? ` — ${(matchedLog.missions as any).tittel}` : ''}
```

Med:
```
{matchedLog.flight_date ? format(new Date(matchedLog.flight_date), 'dd.MM.yyyy') : 'Ukjent dato'} — {matchedLog.flight_duration_minutes} min
{matchedLog.missions ? ` — ${(matchedLog.missions as any).tittel}` : ''}
```

Én linje endres. Ingen andre filer berørt.

