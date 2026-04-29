Revidert implementeringsplan

1. Plassering av innstillingen
- Ikke legge dette i Avisafe/superadmin sin selskapsadministrasjon (`CompanyManagementSection`).
- Legge innstillingen i selskapets egen admin-side: `ChildCompaniesSection`, under «Selskapsinnstillinger — {selskap}».
- Den skal følge samme mønster som eksisterende innstillinger som «Forhindre egen-godkjenning», med støtte for låsing/arv fra morselskap.

2. Database
- Legge til nye kolonner på `public.companies`:
  - `all_users_can_acknowledge_maintenance boolean not null default false`
  - `propagate_all_users_can_acknowledge_maintenance boolean not null default false`
- `default false` gjør at eksisterende selskap beholder dagens oppførsel til admin aktivt slår dette på.

3. Admin-side for selskapet
- Utvide `ChildCompaniesSection` med:
  - state for `allUsersCanAcknowledgeMaintenance`
  - state i `inherited` for parent-verdi og propagation-flag
  - henting av begge nye kolonner i `fetchParentSettings`
  - låse-logikk for underavdelinger når morselskapet har aktivert propagation
- UI-tekst:
  - Tittel: «Alle brukere kan kvittere ut vedlikehold på ressurser»
  - Beskrivelse: «Når aktivert kan alle brukere med tilgang til ressursen utføre vedlikehold/inspeksjon selv om teknisk ansvarlig er satt. Teknisk ansvarlig styrer fortsatt hvem i avdelingen som får vedlikeholdsvarsel.»
- Når feltet er arvet fra morselskap vises samme lås/arvet-indikasjon som eksisterende innstillinger.

4. «Gjelder for underavdelinger»-logikk
- Koble den nye innstillingen til eksisterende «Gjelder for alle underavdelinger»-bryter for selskapsinnstillinger.
- Når bryteren aktiveres:
  - `propagate_all_users_can_acknowledge_maintenance` settes på morselskapet
  - verdien kopieres til direkte underavdelinger
  - underavdelinger låses fra å overstyre feltet
- Når bryteren deaktiveres:
  - underavdelinger kan igjen overstyre selv, slik eksisterende logikk fungerer.

5. Ressurskvittering
- I `DroneDetailDialog` hente effektiv verdi for selskapets `all_users_can_acknowledge_maintenance`.
- Endre blokkering av «Utfør inspeksjon» slik:

```text
Hvis teknisk ansvarlig er satt og innstillingen er AV:
  kun teknisk ansvarlig kan kvittere ut inspeksjon
Hvis teknisk ansvarlig er satt og innstillingen er PÅ:
  alle brukere med tilgang til ressursen kan kvittere ut inspeksjon
Hvis teknisk ansvarlig ikke er satt:
  dagens oppførsel beholdes
```

- Oppdatere hjelpeteksten ved «Teknisk ansvarlig» fra «Kun denne personen kan utføre inspeksjon og mottar vedlikeholdsvarsel» til en tekst som gjenspeiler ny logikk:
  - «Denne personen mottar vedlikeholdsvarsel. Kvittering kan begrenses til teknisk ansvarlig eller åpnes for alle via selskapsinnstillinger.»

6. RLS / sikkerhet
- Legge til RLS-policy for `drones` som tillater brukere i samme selskap å utføre droneinspeksjonsoppdatering når `all_users_can_acknowledge_maintenance = true`.
- Legge til tilsvarende insert-policy for `drone_inspections` ved behov, slik at inspeksjonsloggen kan opprettes av brukere i samme selskap når innstillingen er på.
- Beholde eksisterende policy for teknisk ansvarlig, slik dagens oppførsel fortsatt fungerer når innstillingen er av.

7. Varsler endres ikke
- `technical_responsible_id` skal fortsatt styre hvem i avdelingen som får vedlikeholdsvarsel for dronen når den er satt.
- Admin i morselskap skal fortsatt få avdelingsvarsel når deres varselinnstilling for vedlikehold i underavdelinger er aktivert.
- Den nye innstillingen påvirker kun hvem som kan kvittere ut vedlikehold/inspeksjon, ikke hvem som varsles.

8. Kontroll etter implementering
- Sjekke at innstillingen ikke vises i Avisafe/superadmin selskapsadministrasjon.
- Sjekke at innstillingen vises på selskapets admin-side.
- Sjekke at propagation til underavdelinger fungerer og låser feltet i underavdeling.
- Sjekke at ikke-teknisk ansvarlig fortsatt blokkeres når innstillingen er av.
- Sjekke at ikke-teknisk ansvarlig kan kvittere inspeksjon når innstillingen er på.