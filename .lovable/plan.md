Jeg fant at badge-fargene nå er sentralisert, men funksjonene er fortsatt ulike:

- Dashboard: godkjenningsbadge kan klikkes for å sende til godkjenning.
- /oppdrag: samme handling ligger kun i «Flere valg», ikke på selve badgen.
- Dashboard: SORA-badge vises alltid, også som «Ikke startet».
- /oppdrag: SORA-badge vises først når `mission.sora` finnes.
- Detaljdialogen viser også «Risiko: Ikke vurdert» og «SORA: Ikke startet», mens /oppdrag-kortet skjuler disse til de er aktivert.
- Godkjenningsflyten er duplisert flere steder, og dashboard setter ikke `submitted_for_approval_at`, mens /oppdrag gjør det.

Plan:

1. Lag felles badge-regler i `oppdragHelpers.ts`
   - Legg til små helper-funksjoner for om badger skal vises:
     - `shouldShowApprovalBadge(...)`
     - `shouldShowSoraBadge(...)`
     - `shouldShowAIRiskBadge(...)`
   - Bruk /oppdrag som fasit: AI-risiko og SORA vises først når de faktisk finnes/er aktivert, ikke som «ikke startet» på kortene.

2. Gjør godkjenningsbadgen lik på /oppdrag og dashboard
   - På /oppdrag: gjør «Ikke godkjent»-badgen klikkbar og åpne samme «Send til godkjenning?»-flyt som menyvalget.
   - Behold menyvalget, men la både badge og meny bruke samme handler.
   - Vis hover/cursor bare når badgen faktisk kan utføre en handling.

3. Gjenbruk godkjenningslogikken
   - Flytt/standardiser selve «send til godkjenning»-oppdateringen slik at dashboard og /oppdrag oppfører seg likt.
   - Sørg for at begge setter:
     - `approval_status: 'pending_approval'`
     - `submitted_for_approval_at: new Date().toISOString()`
   - Behold eksisterende sjekk for SORA-krav og godkjennere.
   - Behold e-postvarsling til godkjennere.

4. Gjør SORA-badgen lik
   - Dashboardets oppdragskort skal ikke vise «SORA: Ikke startet» automatisk.
   - Vis SORA-badge kun når det finnes en `mission_sora`-rad/status, på samme måte som /oppdrag.
   - Når SORA-badgen vises, skal den være klikkbar og åpne samme manuelle SORA-fane som i dag.

5. Gjør AI-risiko-badgen lik
   - Dashboard og /oppdrag skal begge kun vise AI-badge når det finnes en AI-risikovurdering.
   - Begge skal åpne historikk/resultat ved klikk.
   - Ingen «ikke vurdert»-badge på kortvisningene, slik at inaktive badger ikke forstyrrer.

6. Oppdater detaljdialogen kontrollert
   - MissionDetailDialog kan fortsatt ha handlingsknappene «Risikovurdering» og «NOTAM» øverst.
   - Badge-raden normaliseres til samme logikk som kortene: aktive statusbadger vises som badger, mens nye handlinger tas via knappene.
   - Godkjenningsbadgen i detaljdialogen beholdes klikkbar for «Ikke godkjent».

7. Verifisering
   - Kjør TypeScript/build-sjekk.
   - Søk etter gjenværende lokale/avvikende badge-logikk i `MissionsSection`, `MissionDetailDialog` og `MissionCard`.
   - Sjekk spesielt mobilvisning, siden dashboardkortet er trangt på små skjermer.