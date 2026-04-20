

## Plan: Utvid arv-mekanisme til SORA-config, mission roles og flight alerts

Bygger videre på samme låsemønster som allerede finnes for Avviksrapport og de fem company-flagg-feltene. Når morselskapet slår på «Gjelder for alle underavdelinger» for et område, skal verdiene pushes til alle avdelinger OG avdelings-admin ser låst UI med badge «Arvet fra {morselskap}».

### Database-endringer

**1. På `companies` (tre nye propageringsflagg):**
- `propagate_sora_buffer_mode boolean default false`
- `propagate_mission_roles boolean default false`
- `propagate_flight_alerts boolean default false`

(SORA-buffermodus, geography og altitude grupperes under én «SORA-defaults»-toggle siden de allerede deler samme «Gjelder for alle underavdelinger»-område i UI.)

### Endringer i `ChildCompaniesSection.tsx`

**Hent inn parent-data:**
- Utvid `inherited`-state med `propagate_sora_buffer_mode`, `propagate_mission_roles`, `propagate_flight_alerts`.
- Hent parent-verdiene parallelt:
  - `default_buffer_mode`, `default_flight_geography_m`, `default_flight_altitude_m` fra parent sin `company_sora_config`.
  - `company_mission_roles` for parent (liste).
  - `company_flight_alerts` + `company_flight_alert_recipients` for parent.

**SORA-defaults-blokk (buffermodus + Flight Geography + flyhøyde):**
- Når `isChildDept && parent.propagate_sora_buffer_mode`: vis Lock-badge «Arvet fra {parentNavn}», bruk parent-verdiene som visning, deaktiver RadioGroup + begge Sliders.
- Eksisterende «Gjelder for alle underavdelinger»-toggle (linje 1167) utvides til også å persistere `propagate_sora_buffer_mode = true/false` på morselskapet OG ved PÅ pushe `default_buffer_mode/geography/altitude` til alle barns `company_sora_config` (upsert per barn). Mor-toggle vises kun når `!isChildDept`.

**Roller-blokk:**
- Når `isChildDept && parent.propagate_mission_roles`: vis badge øverst i blokken, vis parent-rollene som lese-chips (ingen X-knapp), skjul «Legg til»-feltet.
- `handleToggleApplyRolesToChildren` må også sette `propagate_mission_roles = true/false` på morselskapet. Når PÅ → kopier roller (eksisterende logikk). Når AV → fjern flagget; barn beholder verdiene men kan nå redigere selv. Mor-toggle vises kun når `!isChildDept`.
- `applyRolesToChildren`-state initialiseres fra egen `propagate_mission_roles` ved fetch.

**Flight alerts-blokk:**
- Når `isChildDept && parent.propagate_flight_alerts`: badge øverst, alle Switch + Input + mottaker-velger settes `disabled`. Verdiene som vises hentes fra parent (via egen `fetchInheritedFlightAlerts`).
- `handleToggleApplyAlertsToChildren` må også sette `propagate_flight_alerts = true/false` på morselskapet og pushe varsler+mottakere til barn (som i dag). Når AV → fjern flagget. Mor-toggle vises kun når `!isChildDept`.
- `applyAlertsToChildren`-state initialiseres fra egen `propagate_flight_alerts`.

### Endring i `CompanySoraConfigSection.tsx`

Komponenten brukes i en egen fane (SORA-konfigurasjon, ikke samme som ChildCompaniesSection). Selv om den allerede har sin egen «Arvet fra»-banner, mangler hardlås når mor har eksplisitt propagering.

- Legg til nytt felt `propagate_sora_config boolean default false` på `companies` (samme mønster).
- Hent dette flagget fra parent. Når `isChild && parent.propagate_sora_config`:
  - Skjul «Lagre»-knappen og deaktiver alle felt (terskler, sliders, switches, hardstop, dokumenter).
  - Vis tydelig låst-banner: «🔒 SORA-innstillingene styres av {parentName}.»
- Legg til en «Gjelder for alle underavdelinger»-toggle nederst (kun synlig for parent / `!isChild`) som setter flagget og pusher hele config-raden til alle barn via `upsert`.

### Filer som endres
- DB-migrasjon: 4 nye boolean-kolonner på `companies` (`propagate_sora_buffer_mode`, `propagate_mission_roles`, `propagate_flight_alerts`, `propagate_sora_config`).
- `src/components/admin/ChildCompaniesSection.tsx` (utvid `inherited`, fetch parent SORA/roles/alerts, tre nye låsegrener, oppdater de tre apply-handlerne med flagg-persistens).
- `src/components/admin/CompanySoraConfigSection.tsx` (parent-flag fetch, disabled-state, ny propageringstoggle for parent).

### UI-detaljer (konsistent med eksisterende)
- Badge: `secondary` med `Lock`-ikon.
- Banner i en låst blokk: `border-primary/40 bg-primary/5` med Lock-ikon + tekst «Styres av morselskapet ({parentNavn})».
- Tooltip på låste kontroller: «Denne innstillingen er styrt av morselskapet. Kontakt morselskapets administrator for å endre.»

