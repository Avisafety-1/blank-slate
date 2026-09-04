# Samme vedlikeholdsdesign ved oppretting av drone

I dag viser «Legg til drone»-dialogen (opprett-modus i `DroneFormFields`) fortsatt det gamle innebygde inspeksjonsskjemaet (Collapsible med alle feltene synlige), mens redigering bruker den nye kort-visningen med popup-dialog. Vi gjør opprettingen lik.

## Slik blir det

- Ved oppretting av ny drone vises samme vedlikeholdsseksjon som ved redigering: kort for «Standard vedlikehold» med blyant som åpner den samme popup-dialogen, og «Legg til ny inspeksjon»-knapp for egendefinerte inspeksjoner.
- Man kan også velge mal fra katalogen (globale og egne maler) allerede før dronen er lagret.
- Siden dronen ikke finnes i databasen ennå, holdes valgene som utkast i dialogen. Når man trykker «Legg til drone» lagres alt samlet:
  - Standard vedlikehold skrives til drone-raden (som i dag — ingen endring i felter eller logikk).
  - Egendefinerte inspeksjoner legges inn i `maintenance_schedules` rett etter at dronen er opprettet.
- «Lagre som mal» er tilgjengelig også i opprettingsflyten (malen er ikke knyttet til dronen).

## Teknisk

- `MaintenanceSchedulesSection.tsx` får en «utkast»-modus: ny valgfri prop (f.eks. `draft`) som gjør at komponenten jobber mot lokal state i stedet for databasen når `resourceId` mangler. Kort-visning, popup-dialog, malvelger og lagre-som-mal gjenbrukes uendret.
- Utkast-modus eksponerer standard-verdiene og listen av egendefinerte inspeksjoner til forelderen via callback/state.
- `DroneFormFields.tsx`: i `mode="create"` fjernes det gamle Collapsible-skjemaet (linje 408–545) og erstattes med vedlikeholdsseksjonen i utkast-modus. Standard-feltene i `DroneFormValues` beholdes som datakilde slik at `AddDroneDialog` sin eksisterende insert-logikk fungerer som før.
- `AddDroneDialog.tsx`: etter at drone-raden er opprettet, gjøres én insert per egendefinert inspeksjon til `maintenance_schedules` (med `drone_id`, `company_id`). Feil her blokkerer ikke opprettelsen — dronen er allerede lagret, og bruker får beskjed.
- Ingen databaseendringer, ingen endring i tilgangsregler. Redigeringsflyten (DroneDetailDialog) er urørt.
- Nye tekster legges i både `no.json` og `en.json` om nødvendig; ellers gjenbrukes eksisterende nøkler.
- Verifisering: `tsgo` + manuell sjekk i preview (opprett drone fra /ressurser med standard vedlikehold + malvalg + en egendefinert inspeksjon, og bekreft at alt ligger riktig etter lagring).
