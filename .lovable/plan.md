

# Plan: Legg til SORA-kategorisering (Steg 0) og buffersone-sjekk

## Hva skal bygges
En ny ekspanderbar seksjon **under "Samlet score"** i risikovurderingen som:

1. **Vurderer om SORA er påkrevd** basert på operasjonsdata (VLOS/BVLOS, høyde, vekt, avstandsregler, C-merking)
2. **Klassifiserer operasjonen** i riktig kategori: Åpen (A1/A2/A3), STS-01/STS-02, eller Spesifikk (SORA påkrevd)
3. **Beregner ALOS** (Attitude Line of Sight) basert på dronens karakteristiske dimensjon
4. **Sjekker om SORA-buffersoner er beregnet** ved å se om `mission.route.soraSettings.enabled` er satt
5. **Anbefaler SORA-bufferberegning** hvis påkrevd men ikke utført

## Endringer

### 1. AI-prompt (`ai-risk-assessment/index.ts`)
Ny seksjon i system-prompten:

**KATEGORISERING — STEG 0: TRENGER OPERASJONEN SORA?**

Instruere AI-en til å:
- Sjekke om operasjonen kan utføres i Åpen kategori (VLOS, <120m, <25kg, ingen slipp/farlig gods)
- Bestemme underkategori A1/A2/A3 basert på avstandskrav og C-merking
- Sjekke om STS-01 eller STS-02 er aktuelt (C5/C6-merking, kontrollert område)
- Hvis verken Åpen eller STS: Operasjonen krever SORA
- Beregne ALOS-avstand: Multirotor/helikopter: 327 × CD + 20m, Fastvinget: 490 × CD + 30m
- Sjekke om SORA-buffersoner er beregnet (fra `mission.route.soraSettings`)

Nytt JSON-felt `operation_classification`:
```json
{
  "operation_classification": {
    "requires_sora": false,
    "category": "Open",
    "subcategory": "A2",
    "reasoning": "VLOS, <120m, drone <25kg med C2-merking",
    "alos_max_m": 347,
    "alos_calculation": "327 × 1m + 20m = 347m",
    "sora_buffers_calculated": true,
    "sora_buffers_recommendation": null,
    "sts_applicable": null,
    "open_category_rules": ["Maks 30m fra utenforstående", "VLOS påkrevd", "1:1-regelen"]
  }
}
```

### 2. Kontekstdata
Inkludere `mission.route.soraSettings` eksplisitt i kontekstdataen som sendes til AI, slik at den kan se om buffersoner er beregnet.

### 3. Ny frontend-komponent: `OperationClassificationSection.tsx`
Collapsible seksjon (samme mønster som Air/Ground Risk) som viser:
- Kategori-badge (Åpen A1/A2/A3 = grønn, STS = gul, SORA = oransje/rød)
- Begrunnelse for kategorisering
- ALOS-avstand (hvis relevant)
- Regler for underkategorien (fra tabellen brukeren lastet opp)
- Varsel hvis SORA er påkrevd men buffersoner ikke er beregnet → "Anbefaler å utføre SORA-bufferberegning på kartet"
- Varsel hvis SORA er påkrevd av selskapet som internkrav

### 4. Plassering i `RiskScoreCard.tsx`
Vises som ny seksjon **rett under "Samlet score"** (før kategori-scorene), da dette er den mest grunnleggende vurderingen.

## Tekniske endringer

| Fil | Endring |
|-----|---------|
| `supabase/functions/ai-risk-assessment/index.ts` | Ny prompt-seksjon for Steg 0, inkludere soraSettings i kontekst, nytt JSON-felt `operation_classification` |
| `src/components/dashboard/OperationClassificationSection.tsx` | Ny komponent |
| `src/components/dashboard/RiskScoreCard.tsx` | Ny prop `operationClassification`, vise under samlet score |
| `src/components/dashboard/RiskAssessmentDialog.tsx` | Sende `operation_classification` til RiskScoreCard |

## Omfang
- Ingen databaseendringer
- Deploy av edge function nødvendig
- Bruker eksisterende data (droneinfo, VLOS/BVLOS, route.soraSettings)

