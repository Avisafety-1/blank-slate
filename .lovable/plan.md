Jeg foreslår å forbedre 2FA-flyten slik at den fungerer bedre når brukeren setter opp 2FA på samme mobil som appen er åpen på.

## Problem
Dagens oppsett viser QR-kode og en manuell hemmelig nøkkel. På mobil er dette tungvint fordi:
- man kan ikke skanne QR-koden med samme telefon
- kopiering av manuell nøkkel krever ofte at man går ut av appen
- når man kommer tilbake kan oppsettet være borte
- Supabase-feilen `A factor with the friendly name "Authenticator" already exists` vises som en rar teknisk feilmelding hvis en uferdig faktor ligger igjen

## Plan

1. Gjør 2FA-oppsettet mobilvennlig
   - Legg til en tydelig knapp: `Åpne i autentiseringsapp`.
   - Knappen bruker TOTP-URI-en fra Supabase, slik at mobilen kan åpne Google Authenticator, Microsoft Authenticator, 1Password, Authy e.l. direkte uten QR-skanning.
   - Behold QR-koden for PC/nettbrett der brukeren kan skanne med en annen enhet.

2. Forbedre manuell kode-flyten
   - Gjør den manuelle nøkkelen enklere å kopiere med tydelig `Kopier nøkkel`-knapp.
   - Legg til kort instruksjon: kopier nøkkelen, åpne autentiseringsappen, velg manuell oppføring, lim inn nøkkel, gå tilbake og skriv inn 6-sifret kode.
   - Gjør teksten mer forståelig på norsk.

3. Bevar uferdig 2FA-oppsett mens brukeren bytter app
   - Lagre midlertidig `factorId`, QR/URI og hemmelig nøkkel i komponentens/session storage under oppsett.
   - Når brukeren kommer tilbake til profilen, kan oppsettet fortsette i stedet for at siden nullstilles.
   - Når brukeren bekrefter eller avbryter, ryddes midlertidig lagring.

4. Rydd opp i eksisterende MFA-konflikter
   - Ved aktivering skal appen først sjekke både verifiserte og uverifiserte TOTP-faktorer.
   - Uverifiserte gamle faktorer slettes før ny opprettelse.
   - Hvis Supabase likevel svarer med `mfa_factor_name_conflict`, skal appen vise en forståelig melding og prøve å rydde opp, i stedet for å vise rå teknisk feil.

5. Unngå fast `friendlyName`-kollisjon
   - Endre intern faktor-navngiving fra fast `Authenticator` til et mer unikt navn, for eksempel `AviSafe 2FA <dato/tid>`.
   - Dette reduserer risikoen for samme konflikt senere.

6. Oppdater norske og engelske oversettelser
   - Legg til tekster for `Åpne i autentiseringsapp`, instruksjoner, kopiering og konflikt/rydde-feil.

## Teknisk
Endringene gjøres hovedsakelig i:
- `src/components/TwoFactorSetup.tsx`
- `src/i18n/locales/no.json`
- `src/i18n/locales/en.json`

Jeg vil ikke endre Supabase-databasen. Dette er en frontend-forbedring av eksisterende Supabase MFA-funksjonalitet.