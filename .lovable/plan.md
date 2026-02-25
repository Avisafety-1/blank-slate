

# Fix: SORA-seksjon i oppdragsrapport PDF

## Problem

SORA-seksjonen i PDF-eksporten (linje 376-404 i `oppdragPdfExport.ts`) viser bare 4 felter med rå engelske/kode-aktige etiketter:

| Nåværende | Ser ut som |
|---|---|
| `Status` | `completed` |
| `SAIL` | `SAIL II` |
| `Final GRC` | `3` |
| `Residual Risk` | `Moderat` |

Resten av SORA-dataene (miljø, ConOps, iGRC, bakkemitigeringer, ARC, luftromsmitigeringer, operative begrensninger, rest-risiko kommentar) ignoreres helt.

## Løsning

Utvide SORA-seksjonen til å vise alle relevante felter med norske etiketter, strukturert i grupper som matcher `SoraResultView.tsx`-komponenten. Ingen nye filer -- kun endring i `oppdragPdfExport.ts`.

### Endring i `src/lib/oppdragPdfExport.ts` (linje 376-404)

Erstatte den enkle 4-felts tabellen med:

**1. Oppsummering og status (tabell 1)**

| Etikett | Kilde |
|---|---|
| Status | `sora_status` (oversatt: draft→Utkast, completed→Fullført, approved→Godkjent) |
| SAIL-nivå | `sail` |
| Rest-risikonivå | `residual_risk_level` |
| Utarbeidet | `prepared_by` + `prepared_at` (formatert dato) |
| Godkjent | `approved_by` + `approved_at` (formatert dato) |

**2. Operasjonsmiljø og ConOps (tabell 2)**

| Etikett | Kilde |
|---|---|
| Miljø | `environment` |
| ConOps-beskrivelse | `conops_summary` (splitTextToSize for lang tekst) |

**3. Bakkebasert risiko -- GRC (tabell 3)**

| Etikett | Kilde |
|---|---|
| iGRC (grunnrisiko) | `igrc` |
| fGRC (endelig) | `fgrc` |
| Bakkemitigeringer | `ground_mitigations` |

**4. Luftromsrisiko -- ARC (tabell 4)**

| Etikett | Kilde |
|---|---|
| Initial ARC | `arc_initial` |
| Residual ARC | `arc_residual` |
| Luftromsmitigeringer | `airspace_mitigations` |

**5. Rest-risiko og begrensninger (tabell 5)**

| Etikett | Kilde |
|---|---|
| Rest-risiko kommentar | `residual_risk_comment` |
| Operative begrensninger | `operational_limits` |

### Statusoversettelse

```text
const soraStatusLabels: Record<string, string> = {
  draft: "Utkast",
  completed: "Fullfort",
  approved: "Godkjent",
};
```

### Sideskift-håndtering

Legge til `if (yPos > 250) { pdf.addPage(); yPos = 20; }` mellom hver undergruppe for å unngå at innhold kuttes.

### Fil som endres

| Fil | Endring |
|---|---|
| `src/lib/oppdragPdfExport.ts` | Erstatte linje 376-404 med utvidet SORA-seksjon (~60 linjer) |

