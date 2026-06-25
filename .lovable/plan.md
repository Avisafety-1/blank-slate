## Problem

På mobil havner footer-knappene ("Tøm", "Angre", "Lagre") delvis utenfor skjermen i signaturdialogen. Skjermbildet viser at hele dialogen rendres _inni_ et annet modal-kort (man ser Avisafe-headeren over og rundete hjørner på toppen), så `fixed inset-0` blir begrenset av en forelder — sannsynligvis fordi `SignatureDrawerDialog` mounter inne i `ProfileDialog`s Radix-DialogContent, som har transform/overflow som bryter `position: fixed`.

## Løsning

1. **Portal til `document.body`** i `SignatureDrawerDialog.tsx` med `createPortal`, så signatur-overlayet alltid blir reelt fullskjerm uansett hvilken forelder som monterer den.
2. **Sikre at footeren alltid er synlig på mobil**:
   - Beholde `height: 100dvh` på ytterste container.
   - Redusere footer-padding på mobil (`p-3` istedenfor `p-4`) og stramme inn topp-paddingen på hint-teksten slik at canvas-området aldri tar plassen til footeren.
   - Sette `overscroll-behavior: contain` for å unngå at Android-Chrome adresse-baren spiser plassen.

Ingen logikk endres — kun layout og portal-mounting i `src/components/SignatureDrawerDialog.tsx`.

### Verifisering

- iPhone 13 Pro Safari og Samsung Chrome (skjermbilde): åpne profil → "Tegn signatur" → alle tre knappene synlige nederst, ingen avkutting.
- Desktop: uendret oppførsel.
