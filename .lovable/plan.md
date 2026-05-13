## Problem

To distinkte feil i den eksporterte risikovurderings-PDF-en:

**1. Unaturlig store mellomrom mellom bokstaver**
Verdier som inneholder tegnene `≤`, `≥`, `²`, `³` rendres med spalting mellom hver bokstav (f.eks. `0 , 3 0  m  ( " d 1  m )` for "0,30 m (≤1 m)"). Dette skjer fordi jsPDF ikke får mappet `≤`/`≥` korrekt mot Roboto-fonten, og faller tilbake til en encoding-modus som setter mellomrom mellom alle tegn i hele strengen.

Tegnene kommer fra `ai-risk-assessment/index.ts` (linje 177–178: `dimensionClass = ≤Xm`, `speedClass = ≤Y m/s`) og fra modellens egne svar.

**2. Kode-språk lekker inn i rapporten**
AI-modellen siterer interne felt-/variabel-navn ordrett i begrunnelsene, f.eks.:
- ``soraSettings.enabled`` satt til true
- `'daysSinceLastFlight'` er null
- `'maxPilotInactivityDays'` er 30 dager

Dette skjer fordi prompten i `ai-risk-assessment/index.ts` (linjer 1668–1670, 1819 m.fl.) bruker `mission.route.soraSettings.enabled`-stil i instruksjonene, og modellen kopierer notasjonen rett inn i den genererte teksten.

## Løsning

### A) Fiks tegn-mellomrom (frontend, src/lib/pdfUtils.ts)
Utvid `sanitizeForPdf` med erstatninger for tegn som ikke renderes trygt av jsPDF/Roboto-embeddingen:

- `≤` → `<=`
- `≥` → `>=`
- `²` → `2`
- `³` → `3`
- `×` → `x`
- `·` → `-`
- ev. `°` beholdes (denne fungerer i dag, brukes for temperatur)

Effekt: alle eksisterende PDF-eksport-løp (risikovurdering, oppdrag, hendelse osv.) renderes uten "letter-spacing"-bug.

### B) Fjern kode-språk fra AI-output (supabase/functions/ai-risk-assessment/index.ts)
1. Legg til en eksplisitt regel i system-prompten:  
   *"Du skal ALDRI sitere interne felt-/variabel-navn (f.eks. `soraSettings.enabled`, `daysSinceLastFlight`, `maxPilotInactivityDays`, camelCase- eller dot-notasjon) i begrunnelser, sammendrag eller kommentarer. Bruk naturlig norsk: «SORA-buffersoner er aktivert», «piloten har ikke loggført flyging», «selskapets grense for pilotinaktivitet er X dager»."*
2. Skriv om de stedene i prompten der vi i dag formidler regler ved å vise feltnavn (linjer 1668–1670, 1819 og lignende) til menneskelig språk – beskriv betydningen i stedet for variabel-navnet. Felt-navnene beholdes kun i JSON-skjema-spesifikasjonen, som modellen ikke skal gjenbruke i fritekst.
3. Som siste sikkerhetsnett, post-processer fritekst-felter (`reasoning`, `summary`, kategori-`reasoning`, `concerns`, `positive_factors`, `recommended_actions.*`) i edge-funksjonen før retur: erstatt typiske camelCase-/dot-tokens (regex som `\b[a-z]+(?:[A-Z][a-zA-Z]+)+\b` og kjente nøkkelord) – men kun innenfor en hvitliste vi vet skal bort, slik at vi ikke ødelegger legitim tekst.

### C) Verifisering
- Trigge en ny risikovurdering på samme oppdrag og laste ned PDF.
- Konvertere PDF til bilder og sjekke at:
  - "≤1 m" / "≤25 m/s" vises som "<=1 m" / "<=25 m/s" uten letter-spacing.
  - Tabellgrunnlag- og iGRC-begrunnelse-tekstene ikke har spalting.
  - Begrunnelser ikke inneholder camelCase- eller dot-notasjon.

## Filer som endres
- `src/lib/pdfUtils.ts` – utvide `sanitizeForPdf`.
- `supabase/functions/ai-risk-assessment/index.ts` – prompt-skriv + post-processing.

Ingen DB-endringer.
