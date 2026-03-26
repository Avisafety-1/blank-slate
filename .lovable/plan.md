

## Ny selskapsinnstilling: «Krev SORA på alle oppdrag»

### Oversikt
Legger til en ny toggle i selskapsinnstillinger som krever at alle oppdrag har gjennomført SORA-analyse (AI-risikovurdering) for å kunne starte flyging eller sende til godkjenning. Brukeren velger om det kreves 1 steg (første AI-vurdering) eller 2 steg (også revurdering). Logikken gjelder kun når SORA-basert godkjenning IKKE er aktivert.

### Endringer

#### 1. Database-migrasjon
```sql
ALTER TABLE companies
  ADD COLUMN require_sora_on_missions boolean NOT NULL DEFAULT false,
  ADD COLUMN require_sora_steps integer NOT NULL DEFAULT 1;
```
`require_sora_steps`: 1 = kun første AI-risikovurdering, 2 = også revurdering (minst 2 entries i `mission_risk_assessments`).

#### 2. `src/hooks/useCompanySettings.ts`
Legg til `require_sora_on_missions` og `require_sora_steps` i `CompanySettings`-interfacet og hent fra database.

#### 3. `src/components/admin/ChildCompaniesSection.tsx`
- Ny state `requireSoraOnMissions` + `requireSoraSteps`
- Ny toggle-boks med label **«Krev SORA på alle oppdrag»**
- Undertekst: *«Gjelder ikke når SORA-basert godkjenning er aktivert»*
- Under togelen: velg antall steg (1 eller 2) via radio/select
- Propager til barn via «Gjelder for alle underavdelinger»

#### 4. `src/hooks/useOppdragData.ts` — handleSubmitForApproval
Før godkjenning sendes, sjekk:
- Hvis `require_sora_on_missions` er aktivert OG `soraApprovalEnabled` er false:
  - Hent antall `mission_risk_assessments` for oppdraget
  - Hvis antall < `require_sora_steps`: vis toast «Gjennomfør SORA først» og returner tidlig
- Krever at hooken tar inn company settings (eller henter dem internt)

#### 5. `src/components/StartFlightDialog.tsx` — blokkere flystart
Når et oppdrag er valgt og `require_sora_on_missions` er aktivert (og ikke `soraApprovalEnabled`):
- Sjekk `mission_risk_assessments`-antall for valgt oppdrag
- Vis advarsel og deaktiver start-knappen hvis SORA mangler

#### 6. `src/components/oppdrag/MissionCard.tsx` — «Send til godkjenning»
Legg til sjekk i `onSubmitForApproval`-kallet: sjekken skjer i `useOppdragData`, men menyelementet kan vise visuell indikator (f.eks. tooltip).

### Logikkflyt
```text
Bruker klikker "Send til godkjenning"
  → require_sora_on_missions = true?
    → soraApprovalEnabled = true? → Hopp over (SORA-godkjenning håndterer dette)
    → Sjekk mission_risk_assessments count >= require_sora_steps?
      → Nei → toast("Gjennomfør SORA først"), avbryt
      → Ja → Fortsett med godkjenning
```

### Filer som endres
1. Database-migrasjon (2 nye kolonner)
2. `src/hooks/useCompanySettings.ts` — 2 nye felt
3. `src/components/admin/ChildCompaniesSection.tsx` — ny toggle + steg-valg
4. `src/hooks/useOppdragData.ts` — SORA-sjekk i `handleSubmitForApproval`
5. `src/components/StartFlightDialog.tsx` — blokkere flystart uten SORA

