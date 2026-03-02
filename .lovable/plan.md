

## Mailliste for alle brukere

### Hva
En ny funksjon på Admin-siden som henter og viser e-postadresser for alle brukere, med mulighet til å kopiere hele listen til utklippstavlen (kommaseparert eller linjeskift).

### Implementering

**1. Utvid `src/pages/Admin.tsx`**
- Legg til en "Kopier mailliste"-knapp i brukeradministrasjonsdelen
- Brukerne (`profiles`) er allerede hentet med `email`-felt i Admin-siden
- Filtrer ut godkjente brukere med e-post, og vis antall
- Kopier-knapp kopierer alle e-postadresser til utklippstavlen (kommaseparert)
- For superadmins: mulighet å velge "Alle selskaper" eller kun eget selskap
- Vis også listen i en utvidbar tekstboks slik at brukeren kan se/velge manuelt

**2. Ingen backend-endringer**
- `profiles`-tabellen inneholder allerede `email`-feltet
- Eksisterende RLS-policyer sikrer at admins kun ser brukere i eget selskap
- Superadmins kan allerede se alle brukere via `count-all-users` edge function, men for mailliste brukes eksisterende profil-data

### Omfang
- Knapp med kopi-ikon ved siden av brukerlisten
- Toast-bekreftelse ved kopiering
- Viser "X e-postadresser kopiert"

