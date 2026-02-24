

# Feature: Velg blant flere matchende flylogger

## Oversikt

Når flere flylogger matcher innenfor et tidsvindu, skal brukeren kunne velge hvilken logg som skal oppdateres, i stedet for at systemet automatisk velger den første.

## Endringer

**Fil: `src/components/UploadDroneLogDialog.tsx`**

### 1. Ny state for kandidatliste

Legg til state `matchCandidates` (array av `MatchedFlightLog`) ved siden av eksisterende `matchedLog`:

```typescript
const [matchCandidates, setMatchCandidates] = useState<MatchedFlightLog[]>([]);
```

### 2. Oppdater `findMatchingFlightLog`-logikken

I stedet for å returnere ved første tidsmatch, samle alle logger som matcher innenfor tidsvinduet (utvide til f.eks. 4 timer). Deretter:

- Hvis 0 kandidater: fall gjennom til varighets-match og single-log fallback (som nå)
- Hvis 1 kandidat: sett `matchedLog` direkte (som nå)
- Hvis 2+ kandidater: sett `matchCandidates` og la `matchedLog` stå som `null` til brukeren velger

### 3. Ny UI-seksjon: kandidatvelger

Mellom warnings-seksjonen og footer-knappene (linje ~909), legg til en ny tilstand for `matchCandidates.length > 1`:

- Vis en liste med RadioGroup-items, hver med dato, varighet og oppdragsnavn
- Når brukeren velger en, sett `setMatchedLog(valgtKandidat)`
- Vis også et alternativ "Opprett nytt oppdrag" nederst i listen

### 4. Reset

Legg til `setMatchCandidates([])` i alle steder der `setMatchedLog(null)` kalles (reset-funksjon og tilbake-knapp).

## Teknisk detalj

Matching-logikken endres fra:
```typescript
// Nåværende: returnerer ved første match
for (const log of logs) {
  if (diffMs <= 60 * 60 * 1000) {
    setMatchedLog(log);
    return;
  }
}
```

Til:
```typescript
// Nytt: samle alle kandidater innenfor 4-timers vindu
const candidates = [];
for (const log of logs) {
  if (diffMs <= 4 * 60 * 60 * 1000) {
    candidates.push(log);
  }
}
if (candidates.length === 1) {
  setMatchedLog(candidates[0]);
} else if (candidates.length > 1) {
  setMatchCandidates(candidates);
  // matchedLog forblir null — brukeren velger
}
// Hvis 0 kandidater: fall gjennom til varighet/fallback
```

UI-velgeren bruker eksisterende `RadioGroup` fra `src/components/ui/radio-group.tsx`.

