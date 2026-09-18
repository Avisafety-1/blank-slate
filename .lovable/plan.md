# Redesign av DJI-siden (/dji)

Siden brukes på DJI-kontrolleren i liggende format. Den skal se ut som resten av AviSafe, være lettere å bruke med skjermtastatur, og tydelig vise at live posisjon deles.

## Utseende

- Samme dronebakgrunn som innloggingssiden i AviSafe (`drone-background.webp`) med mørk overlegg, hvit tekst og glass-kort — samme uttrykk som resten av appen.
- AviSafe-logo øverst, kompakt topplinje tilpasset lav skjermhøyde.
- Alt bygges med eksisterende designtokens (ingen hardkodede farger).

## Innlogging

- Innloggingskortet sentreres, men er begrenset i høyde og scroller internt.
- Når tastaturet åpnes dekker det i dag feltene. Løsning: kortet plasseres øverst (ikke vertikalt sentrert) i liggende visning, feltet som får fokus scrolles automatisk i synlig område (`scrollIntoView` ved fokus), og siden lytter på `visualViewport`-endringer for å krympe området over tastaturet. E-post og passord legges side om side i to kolonner i liggende format, slik at begge er synlige samtidig.

## Etter innlogging: todelt skjerm

- Venstre halvdel: tilkoblingsknapp + logg i egen scrollboks (nyeste nederst, automatisk scroll), med knapper for «Kopier logg» og «Tøm buffer».
- Høyre halvdel: statuspanel med
  - stort statuslys og tekst: Ikke tilkoblet / Kobler til / Tilkoblet
  - forklaring på at live posisjon nå deles til AviSafe når tilkoblingen er aktiv
  - hvilken konto som er innlogget, MQTT-vert (uten passord) og byggversjon
  - tidspunkt for siste `reg_callback`
- Knappeteksten endres fra «Koble til» til «Tilkoblet» (deaktivert, grønn) når `reg_callback` gir `true`, og tilbake til «Koble til på nytt» hvis den gir `false`.

## Posisjon som stopper når man forlater menyen

Dette er ikke bekreftet ennå, så første steg er å måle det. Tiltak i denne rekkefølgen:

1. Legge inn jevnlig statuslogg (hvert 10. sekund) som skriver tidspunktet for siste `reg_callback`, samt logging ved `visibilitychange`/`pagehide`, slik at vi ser om det er webviewet eller MQTT-forbindelsen som avsluttes.
2. Ikke gjøre noe opprydding ved unmount (i dag fjernes den globale `reg_callback`-funksjonen — den beholdes så lenge siden finnes, slik at DJI kan kalle tilbake).
3. Automatisk gjenoppkobling: når siden blir synlig igjen, og konfigurasjonen finnes, kjøres tilkoblingen på nytt uten brukerhandling hvis siste callback er eldre enn ~30 sekunder.

Hvis loggen viser at DJI Pilot 2 river ned webviewet når man forlater «Third-Party Cloud Services», kan ikke nettsiden holde forbindelsen i live alene. Da rapporterer vi det tydelig i statuspanelet og vurderer bridge-API for varig tilkobling i en oppfølging.

## Teknisk

- Kun `src/pages/DjiCloudLogin.tsx` endres, pluss nye i18n-nøkler under `djiCloud.*` i `no.json` og `en.json`.
- Tilkoblingstilstand utledes av en ny `connState`-state (`idle | connecting | connected | failed`), satt fra `reg_callback`-verdien.
- Layout: `lg`-brekkpunkt gir to kolonner; under det beholdes én kolonne.
- Validering: `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`
