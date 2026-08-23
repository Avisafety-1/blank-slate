# Ett felles droneskjema for opprett og rediger

I dag finnes droneskjemaet to steder: `AddDroneDialog` (smal, én kolonne — brukes både fra /ressurser og fra loggimport) og redigeringsvisningen inne i `DroneDetailDialog` (bred to-kolonne med seksjoner). Vi samler feltene i én delt skjemakomponent, slik at begge dialogene ser like ut og har samme felter.

## Hva som bygges

**Ny delt komponent `DroneFormFields`** (`src/components/resources/DroneFormFields.tsx`)
- Rent presentasjonslag: tar imot `values`, `onChange`, `mode: "create" | "edit"` og valgfrie ekstra-slots.
- Samme layout som «Rediger drone»: to kolonner (`lg:grid-cols-[minmax(0,1fr)_420px]`), venstre = katalogvelger, Generell informasjon, Tekniske spesifikasjoner, Merknader, sjekklister; høyre = kort med Operativ status, Inspeksjon og vedlikeholdsintervall, Administrasjon.
- Bruker eksisterende i18n-nøkler (`resourceEditLayout.*`, `resourceDialogs.droneDetail.*`) — ingen ny hardkodet tekst.

**`AddDroneDialog` bruker den delte komponenten**
- Dialogbredde endres til `w-[95vw] max-w-5xl max-h-[90vh]`, tittel forblir «Legg til drone».
- Går fra ukontrollert `FormData` til kontrollert state-objekt (samme form som i redigering), slik at samme komponent kan drive begge.
- Får feltene som i dag mangler ved opprettelse:
  - Avdelingssynlighet (kun for admin, når selskapet har underavdelinger) — lagres etter insert til `drone_department_visibility`.
  - Alle inspeksjons-/varselfelt i samme gruppering som redigering.
- Felter som ikke gir mening ved opprettelse skjules via `mode`: flytimer er redigerbart tall i stedet for «Endre»-knapp med logg, «Flytt drone» og «Slett» vises ikke, tilknyttet personell/utstyr/loggbok vises ikke (kan knyttes etter oppretting).
- Eksisterende `defaultValues` (modell, serienummer, internt serienummer, navn, merknader) forhåndsutfylles som i dag, så loggimport-flyten fungerer uendret.

**`DroneDetailDialog`** bytter ut sin egen redigeringsmarkup med `DroneFormFields` i `mode="edit"`, med sine ekstra slots (flytimer-endre-knapp, flytt drone, personell). Lese-visning, lagring, sletting og alt annet er urørt.

## Resultat
- «Opprett drone» fra /ressurser og «Opprett drone» fra loggimport-dialogen får nøyaktig samme brede, seksjonsdelte skjema som «Rediger drone».
- Ett skjema å vedlikeholde — nye felter legges til ett sted.

## Teknisk
- Ingen databaseendringer.
- Insert-logikken i `AddDroneDialog` beholdes (plan-grense, `onDroneCreated`-callback til loggimport), kun feltkildene endres fra `FormData` til state.
- Avdelingssynlighet gjenbruker samme hook/komponent som redigering (`DepartmentChecklist` + eksisterende visibility-hook), kalt etter at drone-raden er opprettet.
- Verifiseres i preview: opprett fra /ressurser, opprett fra loggimport (auto-match mangler), og redigering av eksisterende drone.
