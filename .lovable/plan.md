# Fase 1: Trygg AI-risikovurdering som grunnlag for automatisk godkjenning

Automatisk godkjenning basert på score beholdes som selskapsinnstilling. Ingen databaseendringer.

## 1) Godkjenningslogikk i egen, testbar funksjon
Ny `approval.ts` med `decideApproval(input) → { status: 'approved' | 'not_approved' | null, reason, severity: 'info' | 'warning' | 'danger' }`. `null` betyr at statusen ikke endres.

Regler (i denne rekkefølgen):
- **Godkjent (`approved`)**: statusen endres aldri. Hard stop → rødt varsel «Oppdraget er godkjent, men siste vurdering har hard stop: …». NO-GO → «… har NO-GO i <kategori>».
- **Sendt til godkjenning (`pending_approval`)**: hard stop eller NO-GO endrer ikke statusen. Det gir et rødt varsel: «Siste vurdering har hard stop: … — godkjenner må ta stilling» (eller «… har NO-GO i <kategori>»). Beslutningen ligger hos godkjenneren. Score under terskel endrer heller ikke statusen («AI-score X under terskel Y — venter på manuell godkjenning»). Alle krav oppfylt, uten hard stop/NO-GO og med automatisk godkjenning på → `approved`.
- **Ikke godkjent (`not_approved`)**: `approved` bare når automatisk godkjenning er på OG score ≥ terskel, ingen hard stop, ingen NO-GO-kategori, vær er vurdert, alle datakilder finnes og vurderingen ble lagret. Ellers uendret, og årsaken oppgis konkret (første krav som ikke er oppfylt).
- **Automatisk godkjenning av:** `decideApproval` returnerer alltid `status=null`, altså ingen statusendring. Begrunnelse og alvorlighetsgrad beregnes likevel, så røde varsler vises fortsatt. `sora_hardstop_requires_approval` ignoreres.
- Begrunnelsene skrives på brukerens språk (NO/EN).
- `normalizeRiskScore` runder til én desimal (6.5 forblir 6.5). Brøk-skalaen (0–1) beholdes.
- **Tilgang:** statusen kan skrives hvis brukeren (1) kan oppdatere oppdraget med sin egen tilgang, eller (2) er tildelt oppdraget som personell. Begge deler sjekkes med brukerens egen tilgang (`callerClient`). Selve skrivingen skjer deretter med service-role. Hvis ingen av delene stemmer, endres ingenting, og begrunnelsen blir «Du har ikke tilgang til å endre godkjenningsstatus».
- Begrunnelsen og alvorlighetsgraden lagres i `aiAnalysis.approvalDecision`. Da kan oppdragskortet vise det røde varselet fra siste vurdering uten nye kolonner.

## 2) Manglende data gir et konservativt resultat
- `dataAvailability = { population, airspace, weather }` lagres i `aiAnalysis.dataAvailability`. Dialogen viser en gul advarsel: «Datagrunnlag mangler: …».
- **Punktoppdrag uten rute:** tettheten beregnes fra SSB/Eurostat i en sirkel rundt oppdragspunktet. Radius = flygeografi + contingency + bakkerisikobuffer fra SORA-innstillingene når de finnes, ellers 500 m. Ground risk-teksten får merknaden «Estimert rundt oppdragspunkt (ingen rute tegnet)».
- **Oppdrag utenfor Norge** (`unifiedAirspaceActive`): det verifiseres at de får Eurostat-tetthet både for rute og punkt, og ikke havner i «ukjent». Hvis ikke, legges Eurostat inn for dem.
- **Befolkning ukjent:** gjelder bare når oppslaget feiler eller oppdraget verken har rute eller koordinater. Da brukes det høyeste befolkningsbåndet, `population=false`, og teksten sier at tettheten er ukjent.
- **Befolkning målt til 0:** gir det laveste befolkede båndet, ikke kontrollert bakkeområde. Kontrollert bakkeområde brukes bare ved det nye valget `controlled`; «Ingen» (`none`) gir det ikke. Teksten «konservativ fallback» om 0-tetthet fjernes.
- **Nytt valg i dialogen:** «Kontrollert bakkeområde (operatør garanterer ingen uinvolverte personer)» med ny i18n-nøkkel i `no.json` og `en.json`.
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
- Det røde varselet vises når siste vurdering har `approvalDecision.severity === 'danger'` på et godkjent oppdrag eller et oppdrag som er sendt til godkjenning. Det vises på oppdragskortet og i godkjenningsvisningen, slik at godkjenneren ser årsaken før hen godkjenner.

## Uendret
iGRC-tabell, M1(B)/M2, C0-kompetanse, SORA-revurderingens fGRC/ARC, observatør/M1(C)-logikken og varslingsflyten for «send til godkjenning».

## Validering
- `approval_test.ts` dekker tilfellene i oppdraget, inkludert 6.5 → 6.5. For `pending_approval` testes dette: hard stop → uendret og årsaken står i begrunnelsen; NO-GO → uendret; lav score → uendret; alt grønt og auto på → `approved`. Testen «pending + hard stop → not_approved» er fjernet.
- Hard stop-test: bare «Observatør» på oppdraget gir `pilot_missing` (via ny ren `filterPilots`).
- `deno test supabase/functions/ai-risk-assessment/` og `npx tsc --noEmit -p tsconfig.app.json`. Edge-funksjonen deployes.
- Manuelt (krever innlogging, gjøres av deg): vurder oppdrag A, lukk, åpne B → ingen data fra A.
- Til slutt: oppsummering av endrede filer og godkjenningsreglene som gjelder.

## Tekniske detaljer
- Filer: `approval.ts` (ny) + `approval_test.ts`, `index.ts`, `missionContext.ts` (kun ny `filterPilots`, observatørkode urørt), `hardStops_test.ts`, `prompts.ts` (luftrom/vær utilgjengelig-regel), `RiskAssessmentDialog.tsx`, kortet som viser risikobadgen, `no.json`/`en.json`, `AGENTS.md` (regel om `decideApproval` som eneste kilde).
