# Fase 1: Trygg AI-risikovurdering som grunnlag for automatisk godkjenning

Automatisk godkjenning basert på score beholdes som selskapsinnstilling. Ingen databaseendringer.

## 1) Godkjenningslogikk i egen, testbar funksjon
Ny `approval.ts` med `decideApproval(input) → { status: 'approved' | 'not_approved' | null, reason, severity: 'info' | 'warning' | 'danger' }`. `null` betyr at statusen ikke endres.

Regler (i denne rekkefølgen):
- **Godkjent (`approved`)**: statusen endres aldri. Hard stop → rødt varsel «Oppdraget er godkjent, men siste vurdering har hard stop: …». NO-GO → «… har NO-GO i <kategori>».
- **Sendt til godkjenning (`pending_approval`)**: hard stop → `not_approved` («Hard stop utløst (…) — send til godkjenning på nytt når forholdet er løst»). Alle krav oppfylt og automatisk godkjenning på → `approved`. Ellers uendret, f.eks. «AI-score X under terskel Y — venter på manuell godkjenning».
- **Ikke godkjent (`not_approved`)**: `approved` bare når automatisk godkjenning er på OG score ≥ terskel, ingen hard stop, ingen NO-GO-kategori, vær er vurdert, alle datakilder finnes og vurderingen ble lagret. Ellers uendret, og årsaken oppgis konkret (første krav som ikke er oppfylt).
- Hard stop-regelen gjelder også når automatisk godkjenning er av. `sora_hardstop_requires_approval` ignoreres.
- Begrunnelsene skrives på brukerens språk (NO/EN).
- `normalizeRiskScore` runder til én desimal (6.5 forblir 6.5). Brøk-skalaen (0–1) beholdes.
- **Tilgang:** statusen skrives via brukerens egen tilgang (`callerClient.update(...).select('id')`). Hvis ingen rad kommer tilbake, endres ingenting, og begrunnelsen blir «Du har ikke tilgang til å endre godkjenningsstatus».
- Begrunnelsen og alvorlighetsgraden lagres i `aiAnalysis.approvalDecision`. Da kan oppdragskortet vise det røde varselet fra siste vurdering uten nye kolonner.

## 2) Manglende data gir et konservativt resultat
- `dataAvailability = { population, airspace, weather }` lagres i `aiAnalysis.dataAvailability`. Dialogen viser en gul advarsel: «Datagrunnlag mangler: …».
- **Befolkning ukjent** (SSB/Eurostat feilet eller ingen rute): bruk det høyeste befolkningsbåndet i iGRC-tabellen. Ground risk-teksten sier at tettheten er ukjent.
- **Befolkning målt til 0:** gir det laveste befolkede båndet, ikke kontrollert bakkeområde. Kontrollert bakkeområde brukes bare når operatøren har valgt det (`proximityToPeople === 'controlled'`). Teksten «konservativ fallback» om 0-tetthet fjernes.
- **Luftrom:** hvis RPC-en feiler eller koordinater mangler, står det «Luftromsdata utilgjengelig — må sjekkes manuelt», og kategorien settes til minst BETINGET. Teksten «Ingen 5 km-soner …» brukes bare når sjekken faktisk ble kjørt.
- **Vær:** hvis værhentingen feiler og vær ikke er valgt bort, får kategorien IKKE VURDERT og `weather=false`.

## 3) Bare piloter teller som piloter
`assignedPilots` tar bare med personell der rollen matcher `/pilot|fjernpilot|rpic/i`, og personell uten rolle (bakoverkompatibelt). Dette gjelder kontrollene for manglende pilot, kompetanse, nylig erfaring og flytimer. Observatørtellingen endres ikke.

## 4) Jobber som henger
- `supabase`, `user` og `jobId`/`finishJob` deklareres før `try`. `catch` kaller `finishJob('failed', …)`.
- `finishJob` kalles før alle tidlige returer: oppdrag ikke funnet, AI-feil 429/402/503 og SORA-feil 429/402.
- `AbortSignal.timeout`: 90 s mot AI-tjenesten (begge kall) og 15 s mot værhentingen.

## 5) Dialogen blander ikke oppdrag (`RiskAssessmentDialog.tsx`)
- Effekt på `[open, currentMissionId]`: vurdering, vurderings-ID, SORA-resultat, kommentarer og input nullstilles til standard. Deretter lastes alltid nyeste vurdering (`data[0]`).
- Observatørantallet settes til oppdragets M1(C)-kvalifiserte antall ved hver lasting (ikke `Math.max`).
- Svar ignoreres hvis `missionId` ikke lenger er valgt oppdrag (sammenlignes via en ref).
- Ett felles «opptatt»-flagg for full vurdering og SORA-revurdering.
- Nye visninger: gul boks for manglende data og rød/gul godkjenningsbegrunnelse. Nye i18n-nøkler i `no.json` og `en.json`.
- Oppdragskortet viser det røde varselet når siste vurdering har `approvalDecision.severity === 'danger'` på et godkjent oppdrag.

## Uendret
iGRC-tabell, M1(B)/M2, C0-kompetanse, SORA-revurderingens fGRC/ARC, observatør/M1(C)-logikken og varslingsflyten for «send til godkjenning».

## Validering
- `approval_test.ts` dekker alle 11 tilfellene i oppdraget, inkludert 6.5 → 6.5.
- Hard stop-test: bare «Observatør» på oppdraget gir `pilot_missing` (via ny ren `filterPilots`).
- `deno test supabase/functions/ai-risk-assessment/` og `npx tsc --noEmit -p tsconfig.app.json`. Edge-funksjonen deployes.
- Manuelt (krever innlogging, gjøres av deg): vurder oppdrag A, lukk, åpne B → ingen data fra A.
- Til slutt: oppsummering av endrede filer og godkjenningsreglene som gjelder.

## Tekniske detaljer
- Filer: `approval.ts` (ny) + `approval_test.ts`, `index.ts`, `missionContext.ts` (kun ny `filterPilots`, observatørkode urørt), `hardStops_test.ts`, `prompts.ts` (luftrom/vær utilgjengelig-regel), `RiskAssessmentDialog.tsx`, kortet som viser risikobadgen, `no.json`/`en.json`, `AGENTS.md` (regel om `decideApproval` som eneste kilde).
