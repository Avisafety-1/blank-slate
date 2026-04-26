Plan for å legge til avdelingspropagering for DJI FlightHub 2 API-nøkkel i selskapsinnstillinger.

1. Databasefelt for FH2-propagering
- Legg til et nytt felt på `companies`, f.eks. `propagate_fh2_credentials boolean not null default false`.
- Dette følger samme mønster som eksisterende `propagate_flight_alerts`, `propagate_mission_roles`, `propagate_sora_buffer_mode` osv.

2. Admin-UI i selskapsinnstillinger
- I `ChildCompaniesSection` legges det inn en egen toggle under DJI FlightHub 2-kortet:
  - Label: «Gjelder for alle underavdelinger»
  - Forklaring: «Når aktivert arver underavdelinger FlightHub 2-nøkkelen fra morselskapet og kan ikke overstyre den.»
- Toggle vises på morselskap og lagres på selskapet.
- Når toggle aktiveres:
  - underavdelinger låses til arvet FH2-tilkobling
  - eksisterende egen FH2-nøkkel i underavdeling bør ikke brukes så lenge arven er aktiv
- Når toggle deaktiveres:
  - underavdelinger kan igjen bruke egen FH2-nøkkel eller konfigurere ny.

3. Lås underavdelingers FH2-felt når arvet
- Når aktivt selskap er en underavdeling og morselskapet har `propagate_fh2_credentials = true`:
  - API-nøkkel-input deaktiveres
  - Lagre/Slett-knapper skjules eller disables
  - det vises badge/tekst «Arvet fra [morselskap]»
  - test/bruk av tilkoblingen fungerer fortsatt via arvet nøkkel
- Dette speiler låsemønsteret som allerede brukes for SORA, roller og flylogg-varsler.

4. Edge Function-logikk for faktisk arv
- Oppdater `flighthub2-proxy` slik at fallback til morselskapets FH2-token/base URL kun skjer når morselskapet har `propagate_fh2_credentials = true`.
- Hvis underavdelingen har egen nøkkel og arv ikke er aktiv, brukes underavdelingens nøkkel.
- Hvis arv er aktiv, prioriteres morselskapets nøkkel slik UI og faktisk API-bruk er konsistent.

5. Synkronisering av status i frontend
- Oppdater henting av selskapsdata i `ChildCompaniesSection` til å inkludere `propagate_fh2_credentials` både for eget selskap og parent.
- Oppdater FH2-statusbadge slik den tydelig viser:
  - «Tilkoblet» for egen nøkkel
  - «Arvet tilkobling» når underavdeling bruker morselskapets nøkkel.
- Etter lagring/sletting/toggling refreshes lokal FH2-state.

Tekniske detaljer
- Berørte filer forventet:
  - `supabase/migrations/...` for nytt boolean-felt
  - `supabase/functions/flighthub2-proxy/index.ts` for parent-fallback-regel
  - `src/components/admin/ChildCompaniesSection.tsx` for UI, state og låsing
- Ingen hemmeligheter flyttes til frontend; FH2-nøkkelen fortsetter å lagres kryptert via eksisterende `save_fh2_token`/`get_fh2_token`-flyt.
- Eksisterende direkte fallback til parent strammes inn slik «gjelder for alle avdelinger» faktisk styrer om underavdelinger skal arve FH2 eller ikke.