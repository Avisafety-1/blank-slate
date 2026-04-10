

## Fiks: FH2-nøkkelfeltet tilbakestilles til maskert verdi

### Problem
Når brukeren klikker "Endre" eller fokuserer feltet, tømmes `fh2Token` korrekt. Men `fetchParentSettings()` kjøres på nytt via Supabase Realtime-kanalen (ved enhver UPDATE på `companies`-tabellen), og linje 288 setter `setFh2Token("••••••••")` tilbake — som overskriver brukerens tomme felt.

### Løsning

**Fil: `src/components/admin/ChildCompaniesSection.tsx`**

1. Legg til en `useRef`-flagg `fh2Editing` som settes til `true` når brukeren klikker "Endre" eller fokuserer det maskerte feltet
2. I `fetchParentSettings`, hopp over `setFh2Token("••••••••")` dersom `fh2Editing.current === true`
3. Sett `fh2Editing` tilbake til `false` etter vellykket lagring/test eller ved avbrytelse (f.eks. en "Avbryt"-knapp)
4. Oppdater `onFocus`-handleren og "Endre"-knappen til å sette `fh2Editing.current = true`

### Teknisk detalj
```tsx
const fh2Editing = useRef(false);

// I fetchParentSettings, linje 288:
if (hasOwnCred && !fh2Editing.current) setFh2Token("••••••••");

// I onFocus og Endre-knapp:
fh2Editing.current = true; setFh2Token("");

// Etter lagring/test:
fh2Editing.current = false;
```

### Filer som endres
- `src/components/admin/ChildCompaniesSection.tsx`

