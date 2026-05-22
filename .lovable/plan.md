## Hva som er feil i dag

Når brukeren krysser av «Ikke vurder vær» (`pilotInputs.skipWeatherEvaluation = true`) i AI-risikovurderingen, instrueres modellen i dag (linje 1605 i `supabase/functions/ai-risk-assessment/index.ts`) til å:

> «Sett `weather.score` til 7, `weather.go_decision` til 'BETINGET', og noter at vær må vurderes separat før flyging.»

Det betyr at vær fortsatt bidrar med en kunstig 7/10 inn i `overall_score`, selv om brukeren eksplisitt ba om at vær ikke skulle vurderes.

## Mål

Når `skipWeatherEvaluation = true`:
- `categories.weather.score` skal være `null` (ikke et tall).
- `weather.go_decision` skal være `"IKKE VURDERT"`.
- Vær-kategorien skal vises i rapporten med tydelig tekst om at vær ikke er vurdert, men uten å trekke ned eller opp.
- `overall_score` skal beregnes som snittet av de **gjenværende 4 kategoriene** (airspace, equipment, pilot_experience, mission_complexity).
- Kp-indeks (geomagnetisk aktivitet) skal også hoppes over i vær-kategorien når vær er skippet, siden den ellers fortsatt ville trukket score.
- HARD STOP-logikken for vær (vind/sikt/nedbør) skal være deaktivert når vær er skippet — brukeren tar ansvar selv.

## Endringer (kun i `supabase/functions/ai-risk-assessment/index.ts`)

### 1) Erstatt vær-merknaden i prompten (rundt linje 1605)
Bytt ut dagens instruksjon med:

> «### VÆR — IKKE VURDERT
> Brukeren har valgt å hoppe over værvurdering. Du MÅ følge disse reglene strengt:
> - Sett `categories.weather.score` til `null` (ikke et tall, ikke 7).
> - Sett `categories.weather.go_decision` til `"IKKE VURDERT"`.
> - `actual_conditions`: «Vær er ikke vurdert av AI etter brukerens valg. Pilot må selv vurdere vær før flyging.»
> - `factors`: tom liste `[]`.
> - `concerns`: tom liste `[]`.
> - IKKE inkluder Kp-indeks/geomagnetisk aktivitet i vær-kategorien (den obligatoriske Kp-regelen gjelder ikke når vær er skippet).
> - IKKE utløs HARD STOP basert på vær (vind, sikt, nedbør, ising, duggpunkt).
> - IKKE inkluder vær-relaterte bekymringer i `summary` eller `recommendations`.
> - Beregning av `overall_score`: ekskluder weather fullstendig. Bruk snittet av de fire øvrige kategoriene (airspace, equipment, pilot_experience, mission_complexity), avrundet til én desimal.»

### 2) Oppdater responseskjema-kommentar (linje ~1897)
Endre `"score": <number 1-10>` til `"score": <number 1-10 eller null hvis IKKE VURDERT>` for weather, og `"go_decision": "<GO|BETINGET|NO-GO|IKKE VURDERT>"`.

### 3) Oppdater Kp-instruksjonen (linje ~1852)
Legg til en innledende setning: «Disse Kp-reglene gjelder KUN når værvurdering er aktiv. Hvis vær er IKKE VURDERT (se vær-merknad over), hopp over Kp-punktet helt.»

### 4) Post-prosessering (sikkerhetsnett)
Etter AI-svaret er parset (rundt linje 2125–2140), legg til:

```ts
if (skipWeather && aiAnalysis.categories?.weather) {
  aiAnalysis.categories.weather.score = null;
  aiAnalysis.categories.weather.go_decision = 'IKKE VURDERT';
}

// Rekalkulér overall_score uten weather hvis vær er skippet
if (skipWeather && aiAnalysis.categories) {
  const otherScores = ['airspace','equipment','pilot_experience','mission_complexity']
    .map(k => Number(aiAnalysis.categories?.[k]?.score))
    .filter(n => Number.isFinite(n));
  if (otherScores.length > 0 && !aiAnalysis.hard_stop_triggered) {
    const avg = otherScores.reduce((a,b) => a+b, 0) / otherScores.length;
    aiAnalysis.overall_score = Math.round(avg * 10) / 10;
  }
}
```

Dette sikrer at selv om AI «glemmer» seg, blir vær-score nullet ut og `overall_score` korrekt regnet uten vær. Hvis en hard stop er utløst i en annen kategori, beholdes AI-ens overall_score som er.

### 5) `previousAnalysis`-snapshot (linje 664)
`weather_score: previousAnalysis.categories?.weather?.score || null` — `||` gjør allerede `null` av falsy verdier, så ingen endring nødvendig. Bekreftet OK.

## Frontend / PDF
- `src/components/dashboard/RiskAssessmentDialog.tsx` og `src/lib/riskAssessmentPdfExport.ts` itererer kategorier generisk. Når `weather.score = null` og `go_decision = "IKKE VURDERT"`, vil de allerede vise kategorien med teksten vi setter i `actual_conditions`. Ingen krav om endring der — men jeg vil ta en sjekk under implementasjon for å være sikker på at `null`-score ikke krasjer rendering (f.eks. ved `.toFixed()`). Hvis det krasjer, legges en liten guard inn for å vise "Ikke vurdert" i stedet for et tall.

## Filer som endres
- `supabase/functions/ai-risk-assessment/index.ts` (prompt + post-prosessering)
- Eventuelt små guards i `RiskAssessmentDialog.tsx` / `riskAssessmentPdfExport.ts` hvis `null`-score ikke håndteres trygt i dag.

Ingen DB-migrasjoner. Ingen RLS-endringer. Ingen sikkerhetspåvirkning.