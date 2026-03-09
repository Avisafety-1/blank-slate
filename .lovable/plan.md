

## Plan: Fjern «Slett bruker via e-post» og legg til «Inviter ny bruker via e-post»

### Tilnærming
Brukeren har helt rett — invitasjonen skal **ikke** opprette en bruker i systemet. Den skal bare sende en e-post med instruksjoner om hvordan mottakeren kan registrere seg selv, inkludert selskapets registreringskode og en lenke til appen.

### Endringer

**1. `src/pages/Admin.tsx`**
- Fjern «Slett bruker via e-post»-seksjonen (linje 645-694) og tilhørende state (`deleteEmail`, `deletingByEmail`)
- Legg til ny Card rett under registreringskode-seksjonen: «Inviter ny bruker via e-post»
  - Input for e-postadresse + «Send invitasjon»-knapp
  - Synlig for admin og superadmin
  - Kaller ny edge-funksjon `invite-user` med `{ email, companyName, registrationCode }`

**2. Ny edge-funksjon `supabase/functions/invite-user/index.ts`**
- Mottar `{ email, companyName, registrationCode }` fra klienten
- Verifiserer at innlogget bruker har admin-rolle
- Henter selskapets SMTP-innstillinger (same pattern som andre e-postfunksjoner via `email-config.ts`)
- Sender e-post med ny mal `user_invite` — inneholder:
  - Velkomstmelding fra selskapet
  - Registreringskoden
  - Lenke til app.avisafe.no for å registrere seg
  - Instruksjoner for registrering

**3. `supabase/functions/_shared/template-utils.ts`**
- Legg til ny default template `user_invite` med variabler: `{{company_name}}`, `{{registration_code}}`, `{{app_url}}`

**4. `supabase/config.toml`**
- Registrer `[functions.invite-user]` med `verify_jwt = false`

### Filer som endres/opprettes
1. `src/pages/Admin.tsx` — fjern slett-seksjon, legg til invitasjonsseksjon
2. `supabase/functions/invite-user/index.ts` — ny edge-funksjon (kun send e-post)
3. `supabase/functions/_shared/template-utils.ts` — ny `user_invite` template
4. `supabase/config.toml` — registrer ny funksjon

