

## "Slett min bruker" i Profil → Sikkerhet

### Hva skal bygges
En "Slett min konto"-knapp i sikkerhetsfanen i ProfileDialog, med en bekreftelsesdialog (AlertDialog) som krever at brukeren skriver inn e-postadressen sin for å bekrefte. Etter bekreftelse kalles en ny Edge Function som lar brukeren slette sin egen konto.

### Hvorfor ny Edge Function
Eksisterende `admin-delete-user` krever admin-rolle. Vi trenger en `delete-own-account`-funksjon som:
- Autentiserer brukeren via JWT
- Kun sletter den innloggede brukeren (aldri andre)
- Gjenbruker samme SET NULL / cleanup-logikk fra `admin-delete-user`
- Logger ut brukeren etterpå

### Plan

**1. Ny Edge Function: `delete-own-account/index.ts`**
- Autentiser via Authorization-header (getUser)
- Kjør samme cleanup som `admin-delete-user`: slett fra koblingstabeller (drone_personnel, mission_personnel, flight_log_personnel, personnel_competencies, personnel_log_entries), slett profil, slett auth user
- Returner 200 ved suksess

**2. `supabase/config.toml`** — Legg til `[functions.delete-own-account]` med `verify_jwt = false`

**3. `ProfileDialog.tsx` — Sikkerhetsfanen**
- Legg til import av `AlertDialog`-komponenter og `Trash2`-ikon
- Legg til state for dialog og e-post-bekreftelse
- Ny seksjon under passordendring med rød "Slett min konto"-knapp
- AlertDialog som forklarer konsekvensene og krever at brukeren skriver inn sin e-post
- Ved bekreftelse: kall `delete-own-account`, deretter `signOut()`

**4. i18n** — Legg til norske og engelske strenger for sletting

### Filer som endres
- `supabase/functions/delete-own-account/index.ts` (ny)
- `supabase/config.toml`
- `src/components/ProfileDialog.tsx`
- `src/i18n/locales/no.json`
- `src/i18n/locales/en.json`

