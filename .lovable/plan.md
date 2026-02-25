

# Fix: Flylogg-oppdatering med bytte av drone/pilot/utstyr

## Problemet

Når en flylogg oppdateres og brukeren bytter drone, pilot eller utstyr, skjer følgende feil:

1. `diffMinutes = nyVarighet - gammelVarighet`. Hvis varigheten er lik → `diffMinutes = 0`
2. Den **nye** dronen/piloten/utstyret får `+0 min` → "Ingen endring i flytid"
3. Den **gamle** dronen/piloten/utstyret beholder flytimene som aldri trekkes fra

Resultatet er at den gamle dronen har for mange timer og den nye har for få.

## Løsning

Endre `saveLogbookEntries` (linje 540-611) til å håndtere ressursbytte:

1. **Hent tidligere ressurser** fra `matchedLog` og junction-tabellene (`flight_log_personnel`, `flight_log_equipment`) + `matchedLog.drone_id`
2. **Trekk fra `oldDuration`** fra ressurser som er fjernet eller byttet ut
3. **Legg til `newDuration`** (full varighet, ikke diff) på nye ressurser
4. **For uendrede ressurser**: legg til bare `diffMinutes` (som i dag)
5. **Oppdater junction-tabeller**: fjern gamle, legg til nye

Tilsvarende for drone i `handleUpdateExisting`: sammenlign `matchedLog.drone_id` med `selectedDroneId`.

## Fil som endres

| Fil | Endring |
|---|---|
| `src/components/UploadDroneLogDialog.tsx` | Refaktorer `saveLogbookEntries` og `handleUpdateExisting` for å håndtere ressursbytte |

## Teknisk detalj

```text
Scenario: Oppdater flylogg, bytt drone A → drone B, varighet uendret (30 min)

DAGENS LOGIKK:
  diffMinutes = 30 - 30 = 0
  Drone B: +0 min  ← FEIL (burde fått +30)
  Drone A: uendret ← FEIL (burde mistet -30)

NY LOGIKK:
  oldDroneId = matchedLog.drone_id (A)
  newDroneId = selectedDroneId (B)
  A ≠ B → ressursbytte!
  Drone A: -oldDuration (-30 min)
  Drone B: +newDuration (+30 min)
```

Samme logikk gjelder for pilot og utstyr. `renderLogbookSection` oppdateres også slik at den viser korrekt label per ressurs — f.eks. "+30 min" for ny drone i stedet for "Ingen endring".

