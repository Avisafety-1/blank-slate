Jeg fant flere inkonsistenser mellom dashboardet og /oppdrag:

- Oppdragsstatus:
  - /oppdrag: `Pågående` = grønn, `Avbrutt` = rød.
  - Dashboard/detail: `Pågående` = gul, og mangler ofte `Avbrutt`.
- AI-risiko:
  - /oppdrag bruker felles helper for `proceed`, `proceed_with_caution`, `not_recommended`.
  - Dashboard bruker lokal logikk for `go`, `caution`, `no-go`, som kan gi feil/default farge hvis DB-verdiene er de samme som på /oppdrag.
- Godkjenning/SORA/NOTAM:
  - Flere lokale fargekart finnes i dashboard-komponentene med litt andre tekstfarger og manglende border-klasser.
- MissionDetailDialog har også egne lokale fargekart, så detaljdialogen kan avvike fra både dashboardkortet og /oppdrag.

Plan:

1. Gjør `/oppdrag` sin fargelogikk til felles kilde
   - Utvid `src/lib/oppdragHelpers.ts` med felles helpers for:
     - oppdragsstatus
     - godkjenningsstatus
     - SORA-status
     - AI-risiko
     - NOTAM-status
   - Behold dagens `/oppdrag`-palett som fasit: `Pågående` grønn, `Planlagt` blå, `Fullført` grå, `Avbrutt` rød.

2. Oppdater dashboardets oppdragsliste
   - Fjern lokale `statusColors`, `getAIRiskBadgeColor` og `getSoraBadgeColor` fra `MissionsSection.tsx`.
   - Bruk helperne fra `oppdragHelpers.ts`.
   - Sørg for at `variant="outline"`/border-stil matcher /oppdrag der det er samme type badge.

3. Oppdater oppdragsdetalj-dialogen
   - Fjern lokale kopier av `statusColors`, AI-risk label/color og SORA-farger i `MissionDetailDialog.tsx`.
   - Bruk samme helperne som /oppdrag og dashboard.
   - Legg inn `Avbrutt`-farge der den mangler.

4. Normaliser AI-risikoverdier robust
   - La felles AI-helper støtte begge verdi-sett dersom de forekommer:
     - `proceed` / `proceed_with_caution` / `not_recommended`
     - `go` / `caution` / `no-go`
   - Label skal fortsatt vises som `Anbefalt`, `Forsiktighet`, `Ikke anbefalt`.

5. Verifisering
   - Kjør TypeScript/build-sjekk.
   - Søk etter gjenværende lokale oppdrags-badge-fargekart for å sikre at dashboard og /oppdrag ikke divergerer igjen.