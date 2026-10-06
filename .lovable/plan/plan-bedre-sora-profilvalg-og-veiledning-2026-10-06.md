# Plan: Bedre SORA-profilvalg og veiledning

## Resultat
- Dokumentvelgeren under Oppdragstyper får ett samlet profiloppslag, filtrering og tydelig profilstatus.
- Bekreftede profiler prioriteres, mens valg av SORA-dokument fortsatt alltid er manuelt.
- Den delte SORA-profilseksjonen får en ekspanderbar veiledning som vises både i selskapsinnstillinger og på den egne siden.

## Gjennomføring
1. Utvide dokumentvelgerens eksisterende datahenting med én spørring for alle aktuelle SORA-profiler, inkludert arvede dokumenter fra morselskap.
2. Legge til kombinerbare filterbrikker for alle dokumenter, dokumenter med profil og valgte dokumenter, med intern horisontal fingerrulling.
3. Gruppere bekreftede profiler øverst i «Alle», vise eksisterende statusbrikke på profilrader og åpne profildialogen uten å lukke dokumentvelgeren.
4. Vise et eksplisitt forslag om å bruke eller erstatte SORA-dokumentet etter valg av dokument med bekreftet profil; aldri velge dette automatisk.
5. Vise advarsel og profillenke dersom et utkast eller en utdatert profil brukes som SORA.
6. Legge den oversatte, ekspanderbare veiledningen øverst i den delte profilseksjonen og lagre åpen/lukket tilstand lokalt per bruker.
7. Verifisere norsk og engelsk tekst, TypeScript, prosjektets kontrollkommando, samt mobil/DJI-rulling og dialogflyt i forhåndsvisningen der innloggingen tillater det.

## Tekniske hensyn
- Gjenbruk `deriveSoraProfileStatus`, `SoraProfileBadge`, `SoraProfileDialog`, eksisterende `setSoraDocument` og samme React Query-nøkler.
- Ingen database- eller tilgangsendringer.
- Behold popupens eksisterende lagplassering; bruk `vh` før eventuell `dvh`, og eksplisitt `touch-action` for begge rulleretninger.
- Alle nye synlige tekster legges i både norsk og engelsk oversettelsesfil.
