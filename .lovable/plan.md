

# Fix: Feil dato-format fra DETAILS.startTime

## Rotårsak

`DETAILS.startTime` returnerer verdier som `"5/5/2023T11:36:03.86 AMZ"` — et ikke-standard datoformat med AM/PM og T-separator. Siden feltet ikke er tomt, brukes det direkte uten at fallback-kjeden (CUSTOM.date UTC osv.) trigges. Men `new Date("5/5/2023T11:36:03.86 AMZ")` gir `Invalid Date`, så klienten faller tilbake til `new Date()` (dagens dato).

Resultatet: Tittelen viser rå-strengen, men oppdraget lagres med dagens dato.

## Plan

### Fil 1: `supabase/functions/process-dronelog/index.ts`

**Etter linje 138** (`let flightStartTime = startTime || ""`) — legg til normalisering av startTime FØR fallback-kjeden:

```typescript
let flightStartTime = startTime || "";

// Normaliser DETAILS.startTime som kan ha format "5/5/2023T11:36:03.86 AMZ"
if (flightStartTime) {
  const parsed = new Date(flightStartTime.replace(/Z$/, '').replace('T', ' '));
  if (isNaN(parsed.getTime())) {
    // Prøv manuell parsing: M/D/YYYY eller MM/DD/YYYY med tid
    const match = flightStartTime.match(
      /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*T?\s*(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(AM|PM)?/i
    );
    if (match) {
      let [, month, day, year, hours, mins, secs, , ampm] = match;
      let h = parseInt(hours);
      if (ampm?.toUpperCase() === 'PM' && h < 12) h += 12;
      if (ampm?.toUpperCase() === 'AM' && h === 12) h = 0;
      flightStartTime = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${String(h).padStart(2,'0')}:${mins}:${secs}Z`;
    } else {
      flightStartTime = ""; // La fallback-kjeden ta over
    }
  }
}
```

Dette konverterer `"5/5/2023T11:36:03.86 AMZ"` → `"2023-05-05T11:36:03Z"` (gyldig ISO).

### Fil 2: `src/components/UploadDroneLogDialog.tsx`

**Linje 386-388** — legg til samme type robust parsing som fallback i klienten:

```typescript
const parseFlightDate = (raw: string): Date | null => {
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d;
  // Fallback: parse M/D/YYYY AM/PM format
  const m = raw.match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*T?\s*(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(AM|PM)?/i
  );
  if (m) {
    let [, month, day, year, hours, mins, secs, , ampm] = m;
    let h = parseInt(hours);
    if (ampm?.toUpperCase() === 'PM' && h < 12) h += 12;
    if (ampm?.toUpperCase() === 'AM' && h === 12) h = 0;
    return new Date(`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${String(h).padStart(2,'0')}:${mins}:${secs}Z`);
  }
  return null;
};
```

Bruk denne i:
- Linje 386: `const flightDate = result.startTime ? (parseFlightDate(result.startTime) || new Date()) : new Date();`
- Linje 641-642 (visning): Bruk `parseFlightDate` for bedre parsing i resultats-headeren

## Tekniske detaljer

- Edge-funksjonen redeployes automatisk
- Regex-mønsteret håndterer formater som `M/D/YYYY`, `MM/DD/YYYY`, med eller uten AM/PM, med eller uten `T`-separator og `Z`-suffix
- Klient-fallback sikrer at selv om edge-funksjonen ikke er redeployet ennå, fungerer parsing korrekt

