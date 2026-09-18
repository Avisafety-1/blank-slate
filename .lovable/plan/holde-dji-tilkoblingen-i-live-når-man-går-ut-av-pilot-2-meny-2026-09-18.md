# Holde DJI-tilkoblingen i live når man går ut av Pilot 2-menyen

## Hva jeg fant

Siden `/dji` gjør i dag bare tre kall mot DJI: lisenssjekk, last «thing»-modul og koble til MQTT (`src/pages/DjiCloudLogin.tsx`, `handleConnect`). Den setter **ikke** arbeidsområde og plattformnavn.

Ifølge DJI sin JSBridge-dokumentasjon er det `platformSetWorkspaceId` og `platformSetInformation` som registrerer plattformen i Pilot 2 og gjør at hjemskjermen viser arbeidsområdet i stedet for «Not Logged In» ([1](https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/pilot-to-cloud/jsbridge.html)). Uten dette behandler Pilot 2 websiden som en løs nettside: når man går tilbake til hjemskjermen, avsluttes plattformen og «thing»-modulen kobles ned — det er nøyaktig det Fly.io-loggen viser som «disconnected».

Dokumentasjonen har også et eget avsnitt om når Pilot 2 kobler fra tredjepartsplattformen, samt tilbakekallet `onStopPlatform` som kjører rett før Pilot avslutter plattformen ([2](https://developer.dji.com/doc/cloud-api-tutorial/en/feature-set/pilot-feature-set/pilot-access-to-cloud.html)).

Brokeren er ikke årsaken: mosquitto har ingen kort tidsavbrudd i konfigurasjonen, og bruas oppsett er uendret. Frakoblingen kommer fra kontrolleren.

## Hva som gjøres

1. **Registrere plattformen skikkelig** (hovedgrepet). Etter at lisensen er godkjent, og før «thing»-modulen lastes:
   - `platformSetWorkspaceId(<uuid>)` — bruker selskapets id fra AviSafe-profilen, slik at hver kunde får sitt eget arbeidsområde.
   - `platformSetInformation("AviSafe", <selskapsnavn>, "Live posisjon til AviSafe")` — dette er navnet Pilot 2 viser på hjemskjermen.
   Da skal Pilot 2 beholde tilkoblingen når man forlater menyen, og hjemskjermen skal vise AviSafe i stedet for «Not Logged In».
2. **Fange DJI sine utgangssignaler.** Legge inn `window.onStopPlatform` og `window.onBackClick` slik at vi ser i loggen om Pilot 2 faktisk avslutter plattformen, og slik at tilbakeknappen ikke river ned tilkoblingen utilsiktet.
3. **Bedre diagnose.** Logge `platformIsVerified()` og resultatet av de to nye kallene, samt vise i statuspanelet hvilket arbeidsområde/selskap som er satt.
4. **Bekrefte fra broker-siden.** Etter publisering: se i Fly-loggen om klienten fortsatt kobler fra når man går til hjemskjermen. Hvis den fortsatt gjør det etter at plattformen er registrert, er det en begrensning i Pilot 2-versjonen på kontrolleren, og vi rapporterer det tydelig i statuspanelet i stedet for å late som forbindelsen lever.

## Teknisk

- Kun `src/pages/DjiCloudLogin.tsx` endres, pluss nye i18n-nøkler under `djiCloud.*` i `no.json` og `en.json`.
- Selskaps-id og navn hentes fra `profiles` → `companies` for innlogget bruker (samme mønster som resten av appen). Mangler uuid, hoppes `platformSetWorkspaceId` over med en tydelig loggmelding.
- Typedeklarasjonen for `window.djiBridge` utvides med `platformSetWorkspaceId`, `platformSetInformation`, `platformIsVerified`.
- Ingen endringer i `mqtt-broker/` eller edge-funksjonene.
- Validering: `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
