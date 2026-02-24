

# Fix: Rå startTime-streng sendes direkte til timestamptz-kolonne

## Problem

Konsollfeilen viser:
```
"invalid input syntax for type timestamp with time zone: \"5/5/2023T11:36:03.86 AMZ\""
```

I `buildExtendedFields` (linje 386-387) sendes `r.startTime` og `r.endTimeUtc` direkte som strenger til `start_time_utc` og `end_time_utc` kolonnene. Disse er `timestamptz`-kolonner som krever gyldig ISO-format. Men DJI-formatet `"5/5/2023T11:36:03.86 AMZ"` er ikke gyldig ISO, og Supabase avviser insert-operasjonen.

`parseFlightDate`-funksjonen som konverterer dette formatet til en gyldig `Date` eksisterer allerede i filen, men brukes ikke i `buildExtendedFields`.

## Fix

**Fil: `src/components/UploadDroneLogDialog.tsx`**

Endre linje 386-387 i `buildExtendedFields` fra:
```typescript
start_time_utc: r.startTime || null,
end_time_utc: r.endTimeUtc || null,
```

Til:
```typescript
start_time_utc: r.startTime ? (parseFlightDate(r.startTime)?.toISOString() || null) : null,
end_time_utc: r.endTimeUtc ? (parseFlightDate(r.endTimeUtc)?.toISOString() || null) : null,
```

Dette bruker den eksisterende `parseFlightDate`-funksjonen til a konvertere rå-strengen til en gyldig ISO-streng for Supabase kan godta den.

En endring, to linjer, en fil.

