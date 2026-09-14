# Trygg DJI-skytilkobling for flere selskaper

## Påvirker dette dagens app.avisafe.no?

Nei. Gjennomgangen viser at alt som er lagt til er nytt og står for seg selv:

- Den nye siden ligger på adressen `/dji` og er lagt inn som en egen, frittstående side ved siden av de andre åpne sidene (innlogging, priser, nyhetsbrev). Ingen eksisterende side eller rute er endret.
- Siden lastes først når noen faktisk åpner `/dji`, så den påvirker ikke oppstart eller ytelse for vanlige brukere.
- Den nye serverfunksjonen `pilot-cloud-config` er ny og kalles kun fra `/dji`. Ingen andre funksjoner er rørt.
- Ingen endringer i databasen, ingen endringer i tilgangsregler, ingen endringer i innlogging for resten av appen.
- Den gamle midlertidige filen `public/pilot-cloud-login.html` er fjernet; den var aldri koblet til noe annet.
- Nye tekster ble lagt til som en egen tekstgruppe i norsk og engelsk uten å endre eksisterende tekster.

Eneste fellesnevner med resten av appen er vanlig innlogging med AviSafe-konto, som brukes uendret.

## Dagens begrensning

Alle selskaper får i dag nøyaktig samme oppsett: ett felles bruker-navn og passord til meldingstjenesten (MQTT) og én felles DJI-lisens. Det betyr at flyvedata fra alle selskaper går inn i samme kanal med samme identitet. Det holder for testing med ett selskap, men er ikke trygt når flere selskaper skal bruke det.

## Mål for flerbruk (multi-tenant)

1. Hvert selskap får sin egen identitet mot meldingstjenesten.
2. Data fra ett selskaps droner kan ikke leses eller påvirkes av et annet selskap.
3. Hver kontroller/drone knyttes til riktig selskap automatisk ved innlogging.
4. Tilgang kan trekkes tilbake for ett selskap uten å påvirke andre.

## Slik gjør vi det

### Steg 1 – Knytt oppsettet til brukerens selskap
Serverfunksjonen finner hvilket selskap den innloggede brukeren tilhører, og returnerer oppsett som gjelder kun det selskapet. Brukere uten aktivt selskap eller aktivt abonnement får avslag.

### Steg 2 – Egne tilganger per selskap
Ny tabell som lagrer meldingstjeneste-bruker, kryptert passord og eget område (topic-prefiks) per selskap. Passord lagres kryptert på samme måte som andre tredjeparts-nøkler i systemet, og kan kun leses av serverfunksjoner. Selskaper uten egen rad får ikke tilgang.

### Steg 3 – Adskilte kanaler
Hvert selskap får sitt eget område i meldingstjenesten, f.eks. `avisafe/<selskaps-id>/…`, og brukeren for selskapet får kun lov å lese og skrive innenfor sitt eget område. Dette settes opp i meldingstjenesten (Fly.io-brokeren) med tilgangsregler per bruker.

### Steg 4 – Registrer kontroller og drone
Når en kontroller kobler seg til, lagrer vi hvilken drone og kontroller som meldte seg, sammen med selskapet. Da vet vi alltid hvilket selskap innkommende data hører til, og administrator kan se og fjerne tilkoblede enheter.

### Steg 5 – Mottak av data med selskapskontroll
Data som kommer inn lagres alltid med selskaps-id hentet fra kanalen, aldri fra det enheten selv påstår. Vanlige tilgangsregler sørger for at hvert selskap kun ser sine egne data.

### Steg 6 – Administrasjon og sporbarhet
Administrator kan se status for selskapets DJI-tilkobling, generere nye tilganger og koble fra enheter. Alle utleveringer av oppsett logges (hvem, når, hvilket selskap).

## Teknisk oppsummering

- Ny tabell `company_mqtt_credentials` (company_id, mqtt_username, mqtt_password_encrypted, topic_prefix, aktiv) med RLS: kun lesing via `SECURITY DEFINER`-funksjon, service_role for edge functions.
- `pilot-cloud-config` utvides: hent selskap via `requireUser` + `user_companies`/`profiles`, sjekk aktivt abonnement, slå opp selskapets rad, dekrypter passord med `pgp_sym_decrypt`, returner selskapsspesifikk `mqttUsername`/`mqttPassword`/`topicPrefix`. DJI appId/appKey/license forblir felles Supabase-secrets.
- Ny tabell `dji_cloud_devices` (company_id, device_sn, kontroller-sn, sist sett) for enhetsbinding.
- Mosquitto på Fly.io: ACL-fil per bruker generert fra tabellen, eller bruk av auth-plugin mot Supabase. Krever deploy i det separate broker-repoet.
- Revisjonslogg for hver konfig-utlevering.
- Fallback: eksisterende felles `MQTT_USERNAME`/`MQTT_PASSWORD` beholdes kun til migrering er ferdig, og fjernes deretter.

## Rekkefølge

1. Tabell + kryptert lagring og admin-oppsett for ett pilotselskap (Elverum).
2. Utvidet `pilot-cloud-config` med selskapsoppslag.
3. Tilgangsregler per område i brokeren.
4. Enhetsregistrering og datamottak med selskaps-id.
5. Admin-grensesnitt og logg.
6. Fjern felles fallback-tilgang.
