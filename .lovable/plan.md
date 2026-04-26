Jeg fant årsaken: re-vurderingen bruker en egen SORA-gren i `ai-risk-assessment` som lar AI-en returnere `recommendation` uavhengig av `overall_score`. Dermed kan den lagre `no-go` samtidig som scoren fortsatt er 5.0. Det gir inkonsistent UI og historikk.

Plan:

1. Innfør deterministisk anbefaling basert på score og hard stop
   - Lag en felles helper i `supabase/functions/ai-risk-assessment/index.ts` som normaliserer anbefaling etter faste regler:
     - `hard_stop_triggered === true` → `no-go`
     - score `>= 7` → `go`
     - score `>= 5` og `< 7` → `caution`
     - score `< 5` → `no-go`
   - Dette matcher eksisterende skala: 5–6 = forhøyet risiko/tiltak, ikke automatisk no-go.

2. Bruk samme normalisering for vanlig risikovurdering
   - Etter AI-svaret parses og score normaliseres, overskriv `aiAnalysis.recommendation` med helperen.
   - Hvis AI har satt `hard_stop_triggered=true`, behold `no-go` og hard stop-årsak.
   - Hvis AI feilaktig sier `no-go` på score 5.0 uten hard stop, endres det til `caution`.

3. Bruk samme normalisering for SORA re-vurdering
   - Normaliser `soraAnalysis.overall_score` og `soraAnalysis.recommendation` før lagring.
   - Hvis SORA re-vurderingen ikke returnerer score, behold tidligere score.
   - Bruk deretter samme score til både `mission_risk_assessments.overall_score`, `recommendation` og `sora_output.recommendation`.

4. Gjør prompten tydeligere
   - Legg inn eksplisitt regel i både vanlig vurdering og SORA re-vurdering:
     - `score 5.0–6.9` skal være `caution`, med mindre en faktisk hard stop er utløst.
     - `no-go` krever enten score under 5 eller hard stop.
   - Dette reduserer sjansen for at AI produserer motstridende tekst/summary.

5. Oppdater visningstekst om nødvendig
   - Sjekk `RiskScoreCard` og badge-labels for at `caution` fortsatt vises som «Fly med forholdsregler»/«Forsiktighet».
   - Ingen endring i fargepalett: 5.0 skal fortsatt være gul/betinget.

6. Verifisering
   - Kjør TypeScript/build-sjekk.
   - Søk etter andre steder der `recommendation` utledes direkte fra AI uten normalisering.
   - Test mentalt/med kodeflyt at: score 5.0 + ingen hard stop = `caution`, både ved første vurdering og re-vurdering.