

## Fix: Forenkle FH2-nøkkel UI-flyten

### Problemer i dag
1. **"Test tilkobling" krever at man limer inn nøkkelen på nytt** — selv om den allerede er lagret i databasen. Grunnen: `handleTestFh2` sjekker `fh2Token === FH2_MASK` og avviser.
2. **"Test" lagrer også nøkkelen** — forvirrende at test-knappen har en save-side-effect.
3. **"Endre"-knappen er overflødig** — den gjør det samme som å klikke i feltet.

### Løsning

**Fil: `src/components/admin/ChildCompaniesSection.tsx`**

1. **"Test tilkobling" skal fungere med lagret nøkkel**: Når `fh2Token === FH2_MASK`, kall `test-connection` direkte uten å først kalle `save-token` (nøkkelen er allerede i DB). Bare kall `save-token` + `test-connection` når brukeren har limt inn en ny nøkkel.

2. **Fjern "Endre"-knappen**: Brukeren kan bare klikke i feltet for å redigere (onFocus-logikken finnes allerede).

3. **Forenkle knappene til**:
   - **"Lagre"** — kun synlig når brukeren har endret nøkkelen (dvs. `fh2Token !== FH2_MASK` og `fh2Token !== ""`)
   - **"Test tilkobling"** — alltid tilgjengelig når det finnes en nøkkel (enten `FH2_MASK` eller ny inntastet)
   - **"Slett"** — som i dag, kun synlig når tilkoblet

### Tekniske endringer

```
handleTestFh2:
  - Hvis fh2Token === FH2_MASK → kall kun "test-connection" (nøkkelen er allerede lagret)
  - Hvis fh2Token er en ny verdi → kall "save-token" først, deretter "test-connection"
  - Fjern sjekken som blokkerer FH2_MASK

handleSaveFh2:
  - Fjern feilmelding om "Klikk Endre nøkkel først"
  - Hvis fh2Token === FH2_MASK → vis toast "Nøkkelen er allerede lagret"

UI:
  - Fjern "Endre"-knappen helt
  - "Lagre"-knappen: disabled når fh2Token === FH2_MASK eller tom
  - "Test tilkobling": disabled kun under testing, ikke når fh2Token === FH2_MASK
```

