# Gjennomgang av arv til avdelinger

Jeg har gått gjennom alle «gjelder for alle avdelinger»-bryterne og sjekket om avdelingene faktisk får se og bruke det som arves.

## Dette fungerer i dag

- **Selskapsinnstillinger** (luftromsvarsler, anonym rapportering, krav om oppdragsgodkjenning, forbud mot selvgodkjenning, vedlikeholdskvittering, SORA påkrevd, avviksrapport): verdiene skrives ned til avdelingene hver gang morselskapet lagrer.
- **Currency-krav og synlighet for hendelser**: leses direkte fra morselskapet, og avdelinger har lov til å lese morselskapets rad.
- **Varsler ved logg-opplasting** (batteri, høyde, fart osv.): oppslaget skjer i en databasefunksjon som selv finner morselskapet når bryteren er på.
- **FlightHub 2-tilkobling**: avdelinger uten egen tilkobling faller automatisk tilbake til morselskapets.
- **Oppdragstyper**: rettet i forrige runde.

## Dette er brutt

1. **Standard kartlag når det arves.** Bryteren lagres på morselskapet, men ingenting skrives til avdelingene, og kartet leser kun avdelingens egne kartlag. Avdelinger får derfor aldri morselskapets standardoppsett.
2. **Endringer i ettertid når ikke frem (drift).** Oppdragsroller og SORA-standarder (bufferform, flygeområde, høyde) kopieres til avdelingene kun i det øyeblikket bryteren slås på. Legger morselskapet til en ny rolle eller endrer standardhøyden etterpå, får avdelingene det aldri — selv om feltet står låst hos dem.
3. **Nye avdelinger får ingenting.** En avdeling som opprettes etter at bryteren ble slått på, får ingen kopi i det hele tatt — den står da med tomme roller og uten SORA-standarder.
4. **Arvede lister vises tomme hos avdelingen.** I avdelingens egne innstillinger hentes morselskapets roller, varsler og varselmottakere direkte, men tilgangsreglene gir ikke avdelingen lov til å lese morselskapets rader. Det låste feltet viser derfor en tom liste.

## Hva jeg foreslår

Samme løsning som for oppdragstyper: avdelingen **leser** morselskapets verdier når bryteren er på, i stedet for å leve på en kopi som blir utdatert.

1. **Oppdragsroller**: avdelingen leser morselskapets rolleliste når bryteren er på. Ingen kopiering, ingen drift, og nye avdelinger får listen med én gang.
2. **SORA-standarder**: når avdelingen mangler egne verdier eller morselskapet har bryteren på, brukes morselskapets bufferform, flygeområde og høyde i kart og oppdrag.
3. **Standard kartlag**: kartet bruker morselskapets standardlag når bryteren er på.
4. **Varsler**: selve varslingen virker allerede; jeg fikser bare visningen av den arvede listen i avdelingens innstillinger.
5. **Kopieringen beholdes** som den er for de gruppene som allerede skriver ned verdier ved hver lagring — der er det ingen drift.

## Teknisk

- Ny SECURITY DEFINER-funksjon `get_propagating_parent_company_id(_company_id uuid, _flag text)` som returnerer morselskapets id kun når den angitte `propagate_*`-kolonnen er sann. `REVOKE EXECUTE` fra `anon`/`PUBLIC`, `GRANT` til `authenticated` og `service_role`. Eksisterende 1-arguments-variant for oppdragstyper beholdes.
- Utvidet SELECT-policy (kun lesing, ingen skrivetilgang) på `company_mission_roles`, `company_flight_alerts`, `company_flight_alert_recipients` og `company_sora_config` for det propagerende morselskapet.
- Frontend:
  - ny `useCompanyMissionRoles`-logikk (eller utvidelse der rollelisten hentes) som velger morselskapets `company_id` når `propagate_mission_roles` er på — samme mønster som `useCompanyMissionTypes`.
  - `src/pages/Kart.tsx` og `src/components/dashboard/ExpandedMapDialog.tsx`: fallback til morselskapets `company_sora_config` når `propagate_sora_config`/`propagate_sora_buffer_mode` er på.
  - `src/components/OpenAIPMap.tsx`: les `default_map_layers` fra morselskapet når `propagate_default_map_layers` er på.
  - `src/components/admin/ChildCompaniesSection.tsx`: arvede lister vises nå riktig fordi lesetilgangen er på plass.
- Ingen endring i skrivetilgang, og ingen eksisterende kopierte rader slettes.

## Verifisering

Med Tensio Sør (avdeling under Tensio): rolleliste, SORA-standarder og kartlag skal vise morselskapets verdier og være låst; en ny rolle lagt til hos Tensio skal dukke opp hos Tensio Sør uten flere klikk. Selskap uten morselskap, og avdelinger der bryteren er av, skal oppføre seg nøyaktig som før.
