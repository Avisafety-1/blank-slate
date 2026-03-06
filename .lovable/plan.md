

## Lagre DJI-legitimasjon og auto-innlogging

### Oversikt
Legge til mulighet for å lagre DJI-brukernavn og passord sikkert i backend, slik at brukeren automatisk logges inn neste gang de åpner DJI-flyloggimporten. Passordet skal aldri være tilgjengelig i frontend.

### Endringer

**1. Database: Ny tabell `dji_credentials`**
```sql
create table public.dji_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  dji_email text not null,
  dji_password_encrypted text not null,
  dji_account_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.dji_credentials enable row level security;
-- Brukere kan kun se sin egen rad, men IKKE lese passord (det håndteres av edge function)
create policy "Users can read own dji_credentials" on public.dji_credentials
  for select to authenticated using (auth.uid() = user_id);
create policy "Users can delete own dji_credentials" on public.dji_credentials
  for delete to authenticated using (auth.uid() = user_id);
```
Passordet lagres kryptert av edge function med en server-side nøkkel. Frontend får aldri tilgang til `dji_password_encrypted`-kolonnen direkte.

**2. Edge function: `process-dronelog/index.ts` — nye actions**
- `"dji-save-credentials"`: Mottar email + password, krypterer passordet med en DRONELOG_ENCRYPTION_KEY secret, lagrer i `dji_credentials` via service role client. Returnerer `{ saved: true }`.
- `"dji-auto-login"`: Henter brukerens lagrede credentials fra DB, dekrypterer passord, kaller DJI login API, returnerer accountId + email (aldri passord).
- `"dji-delete-credentials"`: Sletter brukerens lagrede credentials.
- Kryptering: Enkel AES-GCM via Web Crypto API (Deno-native), nøkkel fra `DRONELOG_ENCRYPTION_KEY` secret.

**3. Frontend: `UploadDroneLogDialog.tsx`**
- Ny state: `saveCredentials` (checkbox), `hasSavedCredentials` (fra DB), `isAutoLoggingIn`.
- **Ved åpning**: Sjekk om brukeren har lagrede credentials (`select id, dji_email from dji_credentials where user_id = auth.uid()`). Hvis ja → sett `hasSavedCredentials = true`.
- **DJI login-steget**:
  - Hvis `hasSavedCredentials`: Vis "Du er logget inn som [email]" med en "Logg ut"-knapp, og gå direkte til auto-login → dji-logs.
  - Hvis ikke: Vis login-skjema som i dag + ny checkbox "Husk innlogging".
  - Ved vellykket login med checkbox på: Kall `dji-save-credentials` action.
- **DJI logs-steget**: Legg til "Logg ut av DJI"-knapp som:
  - Kaller `dji-delete-credentials` (hvis lagret)
  - Nullstiller `djiAccountId`, `djiLogs`, `hasSavedCredentials`
  - Går tilbake til `dji-login`-steget
- **Auto-login ved åpning**: Når dialogen åpnes og bruker velger "DJI Cloud", hvis `hasSavedCredentials` → automatisk kall `dji-auto-login` → fetch logs → gå til `dji-logs`.

### Sikkerhet
- Passord krypteres server-side med AES-GCM, nøkkel kun i Supabase secrets
- Frontend ser aldri passordet — kun e-postadressen
- RLS hindrer tilgang til andre brukeres data
- Brukeren kan slette lagrede credentials når som helst via "Logg ut"

