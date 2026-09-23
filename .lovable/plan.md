# Datovelgeren lukker seg i oppdragsdialogen (iPad PWA)

## Hva du opplever
Når du kommer fra ruteplanleggeren i kartet og skal sette tidspunkt på et nytt oppdrag, lukker iPadens dato-/klokkeslettvelger seg av seg selv etter ca. ett sekund. I inkognito fungerer det, som betyr at noe i den installerte app-versjonen (lagret versjon på iPaden) eller i selve oppstartsflyten fra kartet utløser det.

## Hva jeg har bekreftet i koden
- Begge tidsfeltene bruker iPadens innebygde dato-/klokkeslettvelger. Den beholdes, slik du ba om.
- Når dialogen åpnes fra ruteplanleggeren, starter den et adresseoppslag mot Geonorge for å fylle inn stedsnavn. Svaret kommer typisk etter rundt ett sekund og skriver da inn i det samme skjemaet som tidspunktet ligger i.
- Dialogen kjører også en oppstartsrutine som kan gå flere ganger mens den er åpen, avhengig av hva som sendes med fra kartet.
- Appen reagerer i tillegg når den går fra bakgrunn til forgrunn. På iPad kan åpning av systemvelgeren gi et slikt signal.

Årsaken er ikke endelig bevist ennå (jeg kan ikke logge inn på iPaden din), så første steg er å bekrefte den.

## Slik går vi frem

1. **Bekreft årsaken**
   Legge inn midlertidig logging som viser nøyaktig hva som skjer i sekundet før velgeren lukker seg: adresseoppslaget, ny oppstart av skjemaet, eller forgrunns-oppdateringen. Du åpner dialogen fra kartet én gang på iPaden, og vi leser loggen.

2. **Rett årsaken (mest sannsynlige tiltak)**
   - Skjemaet skal ikke skrives til mens du står i et tidsfelt: adresseoppslaget legger seg i kø og fyller inn stedsnavnet først når du er ferdig med tidspunktet.
   - Oppstartsrutinen skal kjøre kun én gang per åpning av dialogen, ikke på nytt mens den står åpen.
   - Forgrunns-oppdateringen skal ikke tvinge fram en ny oppbygging av dialogen når den allerede står åpen.

3. **Rydd bort gammel lagret app-versjon**
   Siden det fungerer i inkognito, sjekker vi at iPaden faktisk får siste versjon av appen, og at den installerte appen oppdaterer seg som den skal.

4. **Verifisering**
   Du tester på iPaden: kart → ruteplanlegger → nytt oppdrag → sett dato og tid. Velgeren skal bli stående til du bekrefter, og både start- og sluttidspunkt skal lagres riktig.

## Teknisk

- Fil: `src/components/dashboard/AddMissionDialog.tsx`
  - Reverse-geocoding-kallet (linje ~360-375) skriver `setFormData` asynkront ~1 s etter åpning. Gate skrivingen bak en `activeTimeFieldRef` (satt i `onFocus`/`onBlur` på `#tidspunkt` og `#slutt_tidspunkt`) og flush den utestående lokasjonsverdien ved blur.
  - Init-effekten (linje 277-405) har `initialFormData`, `initialRouteData` og fire `initialSelected*`-props i dependency-arrayet. Latch den med en `initializedForOpenRef` slik at den kun kjører ved overgangen `open: false → true`.
  - Tidsfeltene beholdes som `type="datetime-local"`; ingen bytte til egen velger.
- Kontroller at ingenting i `AuthContext` sin `visibilitychange`-håndtering (linje ~840-860) fører til remount av åpne dialoger; ved behov hopp over `refreshAuthState` når en dialog er åpen og sesjonen fortsatt er gyldig.
- Ingen databaseendringer, ingen nye tekststrenger utover eventuell i18n hvis UI-tekst endres.
- Validering: `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
