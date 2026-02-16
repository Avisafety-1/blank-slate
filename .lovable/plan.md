

## AI Re-vurdering med SORA-mal

### Hva dette gjor
Nar brukeren har fylt ut manuelle kommentarer (mitigeringer/forklaringer) for alle 5 risikokategorier i en AI-risikovurdering, vises en ny knapp: "Kjor SORA-basert re-vurdering". Denne sender den opprinnelige AI-analysen sammen med brukerens kommentarer tilbake til AI, som da produserer en strukturert SORA-rapport med iGRC, fGRC, ARC, SAIL, rest-risiko og operative begrensninger -- samme felt som i den manuelle SORA-analysen.

### Brukerflyt

1. Brukeren kjorer en vanlig AI-risikovurdering (som i dag)
2. I resultat-fanen fyller brukeren ut kommentarer for alle 5 kategorier (Vaer, Luftrom, Piloterfaring, Oppdragskompleksitet, Utstyr)
3. Brukeren lagrer kommentarene
4. En ny knapp "Kjor SORA-basert re-vurdering" vises (kun nar alle 5 kommentarfelt har innhold)
5. AI genererer en SORA-strukturert rapport basert pa alle data + brukerens mitigeringer
6. Resultatet vises i en ny fane "SORA" som presenterer dataene i SORA-malen

### Tekniske detaljer

#### 1. Edge function: `supabase/functions/ai-risk-assessment/index.ts`

Legg til stotte for en ny modus `soraReassessment`:

- Nytt request-felt: `{ ..., soraReassessment: true, previousAnalysis: {...}, pilotComments: {...} }`
- Nar `soraReassessment = true`, brukes en alternativ AI-prompt som:
  - Mottar den opprinnelige vurderingen og brukerens mitigeringskommentarer
  - Returnerer SORA-strukturert JSON med felter som matcher `mission_sora`-tabellen:
    - `environment`, `conops_summary`
    - `igrc` (1-7), `ground_mitigations`, `fgrc` (1-7)
    - `arc_initial` (ARC-A til ARC-D), `airspace_mitigations`, `arc_residual`
    - `sail` (SAIL I-VI)
    - `residual_risk_level` (Lav/Moderat/Hoy)
    - `residual_risk_comment`
    - `operational_limits`
    - Pluss opprinnelige kategoriscorer og oppdatert overall-vurdering
- Resultatet lagres som en ny rad i `mission_risk_assessments` med en `sora_output` JSONB-felt
- Resultatet upsert-es ogsa i `mission_sora`-tabellen slik at det synkroniseres med den manuelle SORA-dialogen

#### 2. Database-migrasjon

Legg til kolonne pa `mission_risk_assessments`:

```sql
ALTER TABLE mission_risk_assessments
  ADD COLUMN sora_output jsonb;
```

Dette feltet lagrer den SORA-strukturerte AI-outputen slik at den kan vises i resultat-fanen.

#### 3. `src/components/dashboard/RiskAssessmentDialog.tsx`

- Legg til en fjerde fane "SORA" i TabsList (synlig kun nar `sora_output` finnes)
- Legg til logikk for a sjekke om alle 5 kategorier har kommentarer:
  ```
  const allCommentsComplete = ['weather','airspace','pilot_experience',
    'mission_complexity','equipment'].every(k => categoryComments[k]?.trim())
  ```
- Vis "Kjor SORA re-vurdering"-knappen ved siden av "Lagre kommentarer" nar `allCommentsComplete` er true
- Ny funksjon `runSoraReassessment()` som sender previous analysis + comments til edge function
- SORA-fanen viser resultatet i samme format som SoraAnalysisDialog (Accordion-struktur med Environment, GRC, ARC, SAIL, rest-risiko)

#### 4. Ny komponent: `src/components/dashboard/SoraResultView.tsx`

En read-only visning av SORA-data (gjenbrukbar fra bade AI-resultat og historikk):

- Accordion-seksjoner for:
  - Operasjonsmiljo og ConOps
  - Bakkebasert risiko (iGRC -> tiltak -> fGRC)
  - Luftromsrisiko (initial ARC -> tiltak -> residual ARC)
  - SAIL og rest-risiko
- Viser AI-genererte verdier i Select-lignende displays (read-only)
- Inkluderer en knapp for a lagre til mission_sora (upsert)

### Filer som endres
- Ny migrasjon (database) -- `sora_output` kolonne
- `supabase/functions/ai-risk-assessment/index.ts` -- ny SORA-prompt og -modus
- `src/components/dashboard/RiskAssessmentDialog.tsx` -- ny fane, re-vurderingsknapp, SORA-visning
- Ny fil: `src/components/dashboard/SoraResultView.tsx` -- read-only SORA-visning
