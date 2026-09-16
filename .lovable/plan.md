# Gjennomgang av mqtt-broker for flere selskaper + debug

## Svar på spørsmålene dine

**Sendes brukernavn/passord videre til brua?** Nei. Kontrolleren logger inn på brokeren med brukernavnet, men Mosquitto legger ikke brukernavnet inn i selve meldingen. Brua abonnerer som en egen klient og ser kun tema (`thing/product/{sn}/osd`) og innhold. Brukernavn kan derfor ikke alene fortelle hvilket selskap en posisjon tilhører – med mindre vi skiller selskapene på *port* (se under).

**Bør brukernavn/passord være unikt per selskap?** Ja. I dag deler alle ett par ("dji"/"passord"). Konsekvenser: hvem som helst med de opplysningene kan publisere posisjoner som om de var en annen drone, og du kan ikke stenge ute ett selskap uten å stenge alle. Unike opplysninger gir revokering per selskap, sporbarhet og mulighet for å begrense hvilke serienumre hvert selskap får publisere.

**Er det greit å kun matche på serienummer?** Serienummeret er riktig nøkkel for *hvilken drone* dataene gjelder – det er det eneste DJI sender. Men det bør ikke være eneste *sikkerhet*. Anbefalt kombinasjon: unike opplysninger per selskap styrer hvem som får koble til og hvilke serienumre de får publisere; serienummeret styrer hvilken drone raden knyttes til.

## Plan

### 1. Debug-logging (gjør dette først – løser feilsøkingen din)
- Ny innstilling `LOG_LEVEL` (standard `INFO`, sett `DEBUG` for full utskrift).
- Logg hele JSON-innholdet for hver mottatt melding når `DEBUG` er på.
- Ved `INFO`: én kompakt linje per posisjon uansett om serienummeret finnes eller ikke – serienummer, bredde/lengde, høyde, batteri, tid, og om den ble lagret eller forkastet.
- Tydelig skille i loggen mellom «serienummeret finnes ikke i droneregisteret», «databasen svarte med feil» og «nettverksfeil» – i dag ser alle tre like ut.
- Logg første vellykkede lagring per serienummer, og eventuelle feilsvar fra databasen med statuskode og melding.
- Kort ned negativ mellomlagring fra 5 minutter til 30 sekunder, så en nyregistrert drone fanges opp nesten umiddelbart.
- Kort periodisk statuslinje (hvert 60. sekund): antall meldinger mottatt, lagret, forkastet, per serienummer.

### 2. Skjulte serienumre blir synlige
- Ukjente serienumre samles i en liten liste i minnet som skrives ut med jevne mellomrom, slik at du ser nøyaktig hvilke serienumre som mangler i droneregisteret – med et eksempel på posisjonen de sendte.

### 3. Unike opplysninger per selskap
- Generer brukernavn/passord per selskap (f.eks. `avisafe-<kortid>`), lagret kryptert i databasen på samme måte som FlightHub-nøklene.
- `pilot-cloud-config` leverer selskapets egne opplysninger til innlogget bruker i stedet for de felles.
- Brokeren bygger passordfilen fra databasen ved oppstart og oppdaterer den periodisk (hvert 5. minutt) ved endringer, i stedet for én hardkodet bruker fra oppstartsskriptet.
- Tilgangsregler (ACL) genereres samtidig: hvert selskap får bare publisere på serienumrene som er registrert på selskapets droner. Da kan ikke ett selskap sende data i et annets navn, og «feil selskap»-problemet forsvinner uansett hvordan serienumre skrives.
- Overgang: felles opplysninger beholdes en periode i tillegg, så Tensio ikke mister forbindelsen før de er lagt om.

### 4. Øvrige optimaliseringer i brokeren
- Mosquitto logger i dag `log_type all` (svært pratsomt) – settes til et normalt nivå så bruas logger ikke drukner.
- Brua samler opp posisjoner og skriver i bunter hvert par sekunder i stedet for ett kall per melding – mindre belastning når flere droner flyr samtidig.
- Gjenbruk av nettverksforbindelse mot databasen med automatisk nytt forsøk ved midlertidige feil, så en enkelt feil ikke mister posisjoner.
- Enkel helsesjekk for bru-prosessen, så Fly starter den på nytt hvis den henger.

## Tekniske detaljer

- `mqtt-broker/bridge.py`: strukturert logging, `LOG_LEVEL`, teller-ordbok, 30 s negativ cache, bunt-upsert mot `flighthub2_positions` (`?on_conflict=sn`), `requests.Session` med `HTTPAdapter`/`Retry`.
- `mqtt-broker/entrypoint.sh` + nytt `credsync.py`: henter aktive selskapsopplysninger via REST, skriver `passwd` via `mosquitto_passwd -b` og `acl_file` med `topic write thing/product/<sn>/#` per bruker, `kill -HUP` til mosquitto ved endring.
- `mosquitto.conf`: `acl_file /mosquitto/data/acl`, `log_type error,warning,notice,information`.
- Ny tabell `company_mqtt_credentials` (company_id, username, password_hash/kryptert, enabled, created_at) med RLS og SECURITY DEFINER-oppslag – samme mønster som `company_fh2_credentials`.
- `pilot-cloud-config` slår opp innlogget brukers selskap og returnerer selskapets opplysninger; faller tilbake til fellesnøkkelen til alle er migrert.

## Rekkefølge
Steg 1 og 2 kan gjøres og deployes alene (kun endringer i `mqtt-broker/`), og gir deg innsyn i posisjonene med en gang. Steg 3 krever databaseendring og ny utrulling av både brokeren og appen.
