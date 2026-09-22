# Rollen «bruker» vs «administrator» – hva som faktisk gjelder

## Svar på spørsmålet ditt

Innenfor egen avdeling er det **ingen forskjell** på hva en «bruker» og en «administrator» får **se**. Lesetilgang til dokumenter, droner, utstyr, oppdrag, flygninger, vedlikehold, personell, sjekklister, mapper og filer styres av hvilket selskap raden tilhører – ikke av rolle. Dokumenter fra moderavdelingen vises også for vanlige brukere når «del med underavdelinger» er på, når de er delt eksplisitt med avdelingen, eller når de er globale – og filnedlastingen følger samme regel.

Eneste rolleavhengighet i lesing: en administrator ser i tillegg **underavdelingene** sine. En «bruker» ser bare sin egen avdeling.

## Hva administratorer allerede har (ekte regler, i bruk)

Endre og slette dokumenter i eget selskap; dele/avdele dokumenter med avdelinger; endre selskapsopplysninger og underavdelinger; endre brukerprofiler; tildele og fjerne roller (unntatt superadmin); brukermedlemskap og invitasjoner; avvikskategorier og avviksrapporter; manualer; inspeksjonspakker; synlighet for droner og utstyr på tvers av avdelinger; FH2- og MQTT-nøkler; vedlegg på e-postmaler.

## Hva som bare finnes for det ubrukte rollenavnet «admin»

Ingen konto har rollen «admin» (103 «bruker», 45 «administrator», 2 «superadmin»). Rollen «saksbehandler» er også ubrukt. Disse reglene er derfor uten virkning i dag. De deler seg i to grupper:

### A. Ekte hull – funksjonen finnes i appen og feiler i dag
1. **Roller vises ikke i brukeradministrasjonen.** En administrator kan tildele roller, men kan ikke lese andres roller. Brukerlisten henter rollene direkte, så kolonnen blir tom for alle andre enn en selv.
2. **Droner og utstyr.** Endring/sletting av droner og utstyr en administrator ikke selv opprettet (og ikke er teknisk ansvarlig for) blokkeres. Dette treffer blant annet loggopplasting, batterioppdatering og vedlikeholdssiden.
3. **Flygninger (flight logs) med personell og utstyr.** Administrator kan ikke rette eller slette andres flygninger – rammer bl.a. retting ved duplikatopplasting.
4. **Loggbokføringer på drone og utstyr.** Kan ikke rettes eller slettes av administrator når andre har skrevet dem.
5. **Hendelsesrapporter.** Kan ikke endres eller slettes av administrator når andre har opprettet dem. (Sletting av oppdrag andre eier er i samme kategori.)
6. **E-postmaler og e-postinnstillinger.** Editoren finnes i admin-grensesnittet, men reglene slipper bare «admin» og superadmin inn.

### B. Sannsynlig gamle/lite brukte funksjoner – foreslås ikke endret nå
Integrasjons- og driftslogger: DJI-synkjobber, ArduPilot-parsejobber, FH2 luftromsfeed-logg og -konfig, MCP-revisjonslogg, ECCAIRS-eksport/-integrasjon, masseutsendelse av e-post, ukesrapport-utsendelser, påminnelser om oppdragsgodkjenning, interne meldinger for admin, evalueringssvar delt med admin, videostrømnøkler.

## Foreslått endring

Én migrasjon som utvider reglene i gruppe A til også å gjelde rollen «administrator», med samme selskapsavgrensning som i dag. Reglene utvides – ingen mister tilgang, og vanlige brukere får ingen nye rettigheter. Gruppe B lar vi stå til du eventuelt sier fra.

Etterpå kjøres sikkerhetsskanneren, og jeg rapporterer hva den sier.

## Teknisk

- Berørte tabeller i gruppe A: `user_roles` (SELECT), `drones` (UPDATE/DELETE), `equipment` (UPDATE/DELETE), `flight_logs` (ALL), `flight_log_personnel`, `flight_log_equipment`, `drone_log_entries` (UPDATE/DELETE), `equipment_log_entries` (UPDATE/DELETE), `incidents` (UPDATE/DELETE), `missions` (DELETE), `email_templates`, `email_settings`.
- Hver policy erstattes eksplisitt med `DROP POLICY IF EXISTS` + `CREATE POLICY`, der `has_role(auth.uid(),'admin')` blir `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'administrator')`. Ingen dynamisk SQL.
- Selskapsuttrykkene (`get_user_company_id` / `get_user_visible_company_ids`) beholdes uendret per policy.
- `saksbehandler`-leddene beholdes som de er.
- `missions` UPDATE er allerede dekket av en rollefri policy for eget selskap; kun DELETE mangler.
