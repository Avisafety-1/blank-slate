

## Fiks: Tillat overskrivning av FH2-nøkkel

### Problem
Når en FH2-nøkkel allerede er lagret, viser input-feltet den maskerte verdien `"••••••••"`. Hvis brukeren limer inn en ny nøkkel og trykker Lagre/Test, fungerer det teknisk — men det er to problemer:

1. Hvis brukeren trykker "Lagre" uten å endre feltet, lagres den bokstavelige teksten `"••••••••"` som token, noe som ødelegger tilkoblingen
2. UX-en gir ingen tydelig indikasjon på at man kan endre nøkkelen — det mangler en "Endre"-knapp

### Løsning

**Fil: `src/components/admin/ChildCompaniesSection.tsx`**

1. **Beskytt mot å lagre maskert verdi**: I `handleSaveFh2` og `handleTestFh2`, sjekk om verdien er plassholderen `"••••••••"` og avbryt med feilmelding
2. **Legg til "Endre nøkkel"-knapp**: Når tilkoblet, vis en knapp som tømmer feltet slik at brukeren kan lime inn ny nøkkel
3. **Auto-tøm ved fokus**: Når brukeren klikker i input-feltet og verdien er maskert, tøm feltet automatisk slik at det er klart for ny verdi
4. **Etter vellykket lagring**: Sett feltet tilbake til `"••••••••"` for å indikere at en nøkkel er lagret

### Teknisk detalj
- Konstant `FH2_MASK = "••••••••"` brukes for sammenligning
- `handleSaveFh2`: Legg til guard `if (cleanToken === FH2_MASK) return toast.error("...")`
- `handleTestFh2`: Samme guard
- Ny knapp "Endre nøkkel" som setter `setFh2Token("")` og fokuserer input-feltet
- `onFocus`-handler på input: Hvis `fh2Token === FH2_MASK`, sett `setFh2Token("")`

