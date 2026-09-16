# Hvorfor flighthub2_positions ikke fylles

## Funnet (verifisert mot databasen)

Broker-loggen viser at meldingene når bridgen. Problemet er oppslaget av serienummer.

Serienumrene som kommer fra luftfartøyene er **20 tegn**, mens de samme dronene er registrert i AviSafe med et **avkortet 16-tegns** serienummer:

| Fra MQTT | Registrert i AviSafe | Selskap |
|---|---|---|
| 1581F8DBW255D00A2M0U | 1581F8DBW255D00A | 50c5b8af… |
| 1581F5BKD235B00CB0P3 | 1581F5BKD235B00C | c296a09a… |
| 7CACN540010CZT | ikke registrert | – |
| 4LFCL54005F9TK | ikke registrert | – |

Bridgen slår opp med eksakt treff (`serienummer=eq.{sn}`), finner ingenting, og forkaster raden. Det stemmer med at tabellen har 103 rader fra 14. september (test-dronen «Gard test posisjonsdata», serienummer `4LFCLA9006LKUW`, som var registrert med nøyaktig riktig verdi) og ingenting etter det.

De to siste serienumrene (7CACN…, 4LFCL…) er fjernkontroller/andre enheter som ikke finnes i droneregisteret i det hele tatt.

**Viktig fallgruve:** `1581F8DBW255D00A` finnes som avkortet serienummer hos ett selskap, mens `1581F8DBW255D00A2LK4` finnes fullt utskrevet hos et **annet** selskap. Blind prefiks-matching kan derfor skrive posisjoner til feil selskap.

## Forslag til løsning

### 1. Trygt utvidet oppslag i bridgen (`mqtt-broker/bridge.py`)

Rekkefølge per serienummer:
1. Eksakt treff på `serienummer` — brukes alltid hvis funnet.
2. Hvis ikke: prefiks-søk (`serienummer=like.{sn[:16]}*`) blant droner der det registrerte nummeret er **kortere enn** det innkommende og er et ekte prefiks av det.
3. Treffet aksepteres kun hvis det gir **nøyaktig én** drone. Flere treff → raden forkastes med en tydelig `ALERT ambiguous_sn`-logg som lister kandidatene, slik at ingen posisjon havner hos feil selskap.
4. Ingen treff → dagens `ALERT unresolved_sn` beholdes.

Resultatet caches som i dag (5 min), og negative oppslag caches kortere (30 s) slik at en nyregistrert drone slår gjennom raskt.

### 2. Rydd opp i registrerte serienumre

De avkortede numrene bør oppdateres til fullt 20-tegns serienummer i /ressurser. Da treffer eksakt-oppslaget, og punkt 2–3 over blir bare et sikkerhetsnett. Jeg kan lage en liste over alle droner med mistenkelig korte serienumre hvis du vil.

### 3. Fjernkontroller uten dronekobling

`7CACN…` og `4LFCL…` finnes ikke i registeret. Disse vil fortsatt bli forkastet med `ALERT unresolved_sn` — det er riktig oppførsel til enhetene eventuelt registreres.

## Teknisk

- Kun `mqtt-broker/bridge.py` endres (oppslagsfunksjonen + logging). Ingen endringer i AviSafe-appen, databasen eller edge functions.
- Krever ny `fly deploy` av `mqtt-broker-avisafe` etter endringen.
- Etter deploy verifiseres det med `fly logs` (skal vise innsettinger, ikke `unresolved_sn`) og en telling i `flighthub2_positions`.
