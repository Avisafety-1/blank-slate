

# Tilleggsmoduler: ECCAIRS-integrasjon og SORA Admin

## Oversikt

Legge til to nye tilleggstjenester i kalkulatoren -- "ECCAIRS-integrasjon" og "SORA Admin" -- med avhukingsboks og prisfelt for hver. Disse reflekteres i oppsummeringen (intern) og pristilbudet (kunde).

## Endringer

### 1. Nye felter i CalcState

Legger til 4 nye felter:

| Felt | Type | Default |
|---|---|---|
| `eccairsEnabled` | boolean | false |
| `eccairsPrice` | number | 0 |
| `soraAdminEnabled` | boolean | false |
| `soraAdminPrice` | number | 0 |

### 2. Ny seksjon i kalkulatoren (mellom NRI Hours og oppsummeringskortet)

Et nytt Card med tittel "Tilleggsmoduler" som inneholder:

- **ECCAIRS-integrasjon**: Checkbox + prisfelt (NOK/mnd)
- **SORA Admin**: Checkbox + prisfelt (NOK/mnd)

### 3. Oppsummering (intern tab)

Under "Lopende inntekter" legges det til linjer for ECCAIRS og SORA Admin inntekter (kun nar aktivert og pris > 0). Summene inkluderes i `recurringRevenue`.

### 4. Pristilbud (kunde tab)

**Hvis aktivert og pris satt**: Vises som egne linjer under prisdetaljer, og legges til i total manedlig kostnad.

**Hvis ikke aktivert eller pris = 0**: Vises i en egen boks nederst med teksten "Tilgjengelige tilleggsmoduler" som lister opp modulene med "pris ikke satt" eller den angitte prisen.

### 5. Beregningslogikk

Utvider `calc` useMemo med:
- `monthlyEccairsRevenue`: `eccairsEnabled ? eccairsPrice : 0`
- `monthlySoraAdminRevenue`: `soraAdminEnabled ? soraAdminPrice : 0`

Disse legges til i `recurringRevenue`.

## Tekniske detaljer

### Fil som endres

| Fil | Endring |
|---|---|
| `src/components/admin/RevenueCalculator.tsx` | Legg til felter i CalcState/default, ny Card-seksjon for tilleggsmoduler, oppdater calc useMemo, oppdater begge tabs |

