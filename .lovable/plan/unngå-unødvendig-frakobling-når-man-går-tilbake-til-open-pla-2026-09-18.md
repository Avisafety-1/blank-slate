# Unngå unødvendig frakobling når man går tilbake til «Open Platforms»

## Hva som skjer nå

Plattformregistreringen virker: posisjon sendes fra hjemskjermen og innloggingen holdes.

Når du går tilbake til «Open Platforms» viser Pilot 2 websiden på nytt. Siden starter da opp på nytt i tilstanden «ikke tilkoblet», og den automatiske tilkoblingen kjører hele sekvensen om igjen – laster «thing»-modulen og kobler til MQTT. Det er denne nye tilkoblingen som river ned den eksisterende, og som gir «disconnect» etterfulgt av «connect» i Fly-loggen.

Kort sagt: siden spør aldri DJI om den allerede er tilkoblet før den kobler til på nytt.

## Hva som skal gjøres

1. **Spørre DJI om status før tilkobling.** Før «thing»-modulen lastes og MQTT-tilkoblingen startes, sjekkes DJI sin egen tilkoblingsstatus (`thingGetConnectState`) og om modulen allerede er lastet (`platformIsComponentLoaded("thing")`). Er den allerede tilkoblet, hoppes hele sekvensen over, statuspanelet settes til «Tilkoblet», og det logges at eksisterende tilkobling ble beholdt.
2. **Plattformregistrering kjøres bare én gang.** Lisenssjekk, arbeidsområde og plattformnavn settes kun hvis DJI ikke allerede er verifisert (`platformIsVerified`), slik at retur til menyen ikke nullstiller registreringen.
3. **Automatikken blir mer forsiktig.** Den automatiske tilkoblingen etter innlogging og gjenopprettingen ved «siden blir synlig igjen» kaller først statussjekken. Bare hvis DJI faktisk melder «ikke tilkoblet» settes en ny tilkobling i gang. Det legges også inn en sperre mot flere tilkoblingsforsøk samtidig.
4. **Status hentes ved oppstart.** Når siden lastes på nytt i Pilot 2 leses tilkoblingsstatusen fra DJI med én gang, slik at knappen viser «Tilkoblet» i stedet for å starte et nytt forsøk.
5. **Manuell knapp beholder full kraft.** Trykker du selv på knappen når den viser «Koble til på nytt», kjøres hele sekvensen uansett – slik at du fortsatt kan tvinge en ny tilkobling hvis noe henger.

## Verifisering

Etter publisering: koble til, gå til hjemskjermen, så inn i «Open Platforms» igjen. Fly-loggen skal ikke vise ny disconnect/connect, og loggen på siden skal si at eksisterende tilkobling ble beholdt.

## Teknisk

- Kun `src/pages/DjiCloudLogin.tsx` endres, pluss nye i18n-nøkler under `djiCloud.*` i `no.json` og `en.json` (f.eks. `alreadyConnected`, `checkingState`).
- `Window.djiBridge`-typen utvides med `thingGetConnectState`, `platformIsComponentLoaded`; begge kalles defensivt (`?.`) siden eldre Pilot 2-versjoner kan mangle dem.
- Ny hjelpefunksjon `readConnectState()` som bruker eksisterende `parseBridge` og returnerer `connected | disconnected | unknown`. Ved `unknown` (eldre bridge uten API-et) beholdes dagens oppførsel.
- Ny `connectingRef` hindrer overlappende forsøk; `handleConnect` får et `force`-argument som knappen setter til `true`.
- Ingen endringer i `mqtt-broker/` eller edge-funksjonene.
- Validering: `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
