# Dokumentsynlighet: badges, eierskap og synlighetsvalg

Databasen er allerede oppdatert (ny delingstabell, ny lesepolicy, `get_company_names`, og sikrere `transfer_drone`). Ingen data er endret — sjekklistene "Preflight drone" og "Before takeoff" står fortsatt med global synlighet, slik du ønsker.

## Beslutning

Globalt delte sjekklister beholder global synlighet. Global deling fjernes aldri automatisk av systemet — kun manuelt fra dialogen.

## 0. Rett opp eierskapet på de to sjekklistene

"Preflight drone" og "Before takeoff" ble opprettet i Avisafe, men eierskapet fulgte med da dronen ble flyttet (Trondheim → Moderavdeling → Oslo → Moderavdeling → Bergen). De står nå med "Avdeling Bergen" som eier.

- Sett eier tilbake til Avisafe for begge sjekklistene.
- Global synlighet beholdes, slik at alle selskaper fortsatt ser dem — nå med riktig "Avisafe"-badge.


## Hva som gjenstår

### 1. Riktig badge på delte dokumenter
Badgen viser i dag navnet på eierselskapet kun hvis den innloggede brukeren tilfeldigvis har tilgang til det selskapet. Derfor så du "Avisafe"-badgen som superadmin, men ingen badge i Norconsult.

- Hent selskapsnavn via den nye sikre oppslagsfunksjonen i stedet for direkte kobling mot selskapstabellen.
- Badge vises alltid når dokumentet eies av et annet selskap enn det du står i (f.eks. "Avisafe").

### 2. Synlighetsvalg i "Rediger dokument"
Sjekklister og evalueringsskjema mangler i dag valg for deling.

- Legg til en synlighetsseksjon i dokumentdialogen for alle dokumenttyper:
  - Global synlighet (av/på) — for maler som skal kunne brukes av alle selskaper
  - Synlig for underavdelinger (av/på)
  - Avkryssingsliste for enkeltavdelinger (bruker den nye delingstabellen), med scroll ved lange lister
- Seksjonen er kun redigerbar for eier-selskapet; andre ser den som skrivebeskyttet.

### 3. Slutt på utilsiktet global deling
Ved flytting av drone/utstyr satte systemet global synlighet på dokumenter som skulle deles med en sideordnet avdeling. Det er grunnen til at "Avdeling Bergen"-sjekklistene dukket opp overalt.

- Automatikken deler heretter kun eksplisitt med de avdelingene som faktisk trenger tilgang.
- Dokumenter som allerede er globalt delt røres ikke.
- Bekreftelsesdialogen ved lagring vises kun når det faktisk mangler deling.

### 4. Eierskap ved flytting
Flytting av en ressurs flytter ikke lenger dokumenter som tilhører et annet selskap — de deles i stedet. Dette er allerede på plass i databasen; UI-teksten i flyttedialogen justeres så den forklarer dette.

## Teknisk

- `src/pages/Documents.tsx`: hent eiernavn via `get_company_names`-RPC.
- `src/components/documents/DocumentsList.tsx`: badge basert på oppslagsresultatet, ikke på join.
- `src/components/documents/DocumentCardModal.tsx`: ny synlighetsseksjon (global, underavdelinger, `document_department_visibility`).
- `src/lib/droneVisibilityCheck.ts`: `grantMissingVisibility` skriver til `document_department_visibility` i stedet for å sette `global_visibility = true`; dokumenter med `global_visibility = true` regnes som allerede delt.
- `src/components/resources/MoveDroneDialog.tsx`: tekst/varsel om at fremmede dokumenter deles i stedet for å flyttes.
- Alle nye strenger legges i både `no.json` og `en.json`.
