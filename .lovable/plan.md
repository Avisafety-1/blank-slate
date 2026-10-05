# Fase 2: SORA-korrekthet i AI-risikovurderingen + NO-GO-varsel

Ingen databaseendringer. Inneslutning og OSO-er endres ikke.

## 0) NO-GO-varsel og rester fra fase 1
- `approval.ts`: ny input `overallNoGo` (sann når `aiAnalysis.recommendation === 'no-go'`, etter at anbefalingen er utledet). Behandles likt som NO-GO-kategori i alle grener: severity `danger`, status uendret, aldri auto-godkjenning. Egne NO/EN-begrunnelser med AI-score når det verken finnes hard stop eller NO-GO-kategori, og egen tekst for `approved`.
- `index.ts`: kontroller at «status endret underveis»-grenen setter `approvalDecision.status = null` og at `approvalReason/approvalSeverity` bare settes når `approvalSeverity === null` (lagt inn i forrige runde; verifiseres og beholdes).
- canWrite: legg til superadmin (`has_role(..., 'superadmin')`, som RLS-policyene).

## 1) iGRC etter SORA 2.5
- Ny ren fil `soraGroundRisk.ts`: 7×5-tabell, kolonne = strengeste av dimensjon (1/3/8/20/40 m) og fart (25/35/75/120/200 m/s), rader: kontrollert, <5, <50, <500, <5 000, <50 000, ≥50 000. N/A og >40 m/>200 m/s gir `outsideSora = true` uten SAIL.
- `buildDeterministicGroundRisk` bruker filen; `GRC_MATRIX` og gammel `populationClassIndex` fjernes. Kontrollert kun ved `proximityToPeople === 'controlled'`; tetthet 0 gir «<5»; ukjent tetthet = 5000 → «<50 000» med merknad. M1-gulvet hentes fra kontrollert-raden. ≤250 g og ≤25 m/s gir fortsatt iGRC 1.
- Båndtekster NO/EN oppdateres; `prompts.ts` får ny tabell og instruks om at iGRC/fGRC er systemberegnet og skal gjengis.

## 2) Mitigeringer
- Felles ren funksjon `applyGroundMitigations` (i `soraGroundRisk.ts`), brukt både av hovedvurderingen og revurderingen.
- M1(B): None 0, Medium -1, High -2.
- M2: ingen automatisk kreditering fra utstyrsnavn. Kun manuelt, begrunnelse «Krever dokumentert MoC/DVR-grunnlag». Fallskjermutstyr gir bare hint.
- M1(A), M1(C) uendret. `src/lib/soraAutoMitigations.ts` (forhåndsvisning) speiles slik at M2 ikke lenger forhåndskrediteres.

## 3) fGRC over 7
- Fjern `Math.min(fgrcRaw, 7)`. fGRC > 7 gir SAIL `null`, tekst «Sertifisert kategori — ikke innenfor specific/SORA», anbefaling minst `caution`. Gjelder både hovedvurdering og revurdering.

## 4) C0-kompetanse
- `competency.ts`: C0 (og <250 g legacy/egenbygd) krever ikke bevis, gir status ok med teksten «C0: krever at piloten har lest brukerhåndboken». Aldri kompetanse-hard stop. Øvrige klasser uendret.

## 5) SORA-revurderingen
- Dialogen sender `previousAssessmentId`; serveren henter raden via brukerens tilgang (RLS), sjekker `mission_id`, og godtar bare nyeste ikke-SORA-vurdering, ellers 400 «Kjør revurdering på siste vurdering» (NO/EN). `previousAnalysis` fra klienten ignoreres.
- Revurderingsknappen skjules for eldre vurderinger i historikken.
- fGRC/ARC beregnes i koden: uten overstyringer brukes forrige fGRC/residual ARC; med manuelle mitigeringer `applyGroundMitigations` fra forrige iGRC og gulv; manuell luftrisiko via eksisterende AEC/tetthetslogikk. AI-verdier overstyres før SAIL-oppslag. Promptet sier at fGRC/ARC/SAIL er gitt.
- Hard stop og `approvalDecision` på +SORA-raden kopieres fra databaseraden.

## Tester og validering
- `soraGroundRisk_test.ts`: tilfellene fra bestillingen (M350 → 4, Mavic 3E → 3, fart 30 → 5, tetthet 0 → 2, kontrollert → 1/2, 60 000 kol 2 → utenfor, M1(B) -1/-2, M2 uten manuell 0, fGRC 8 → SAIL null).
- `approval_test.ts`: pending + score 2.0 og approved + score 3.0 → status null, danger.
- `competency_test.ts`: C0 uten sertifikat → ingen hard stop.
- Revurdering med eldre id → 400 (test på den rene valideringsfunksjonen).
- `deno test supabase/functions/ai-risk-assessment/`, `deno check .../index.ts`, `npx tsgo --noEmit -p tsconfig.app.json`, `git diff --check`; deploy edge-funksjonen.
- Oppsummering med gammel vs ny iGRC for typiske oppdrag.

## Tekniske detaljer
Filer: `index.ts`, `approval.ts`, `competency.ts`, `prompts.ts`, ny `soraGroundRisk.ts` + tester, `RiskAssessmentDialog.tsx`, `src/lib/soraAutoMitigations.ts`, `no.json`/`en.json` ved nye dialogtekster, `AGENTS.md` (regel: iGRC/fGRC kun fra `soraGroundRisk.ts`, revurdering leser forrige vurdering fra DB).
