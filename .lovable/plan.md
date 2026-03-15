

# Plan: Biometrisk innlogging (WebAuthn / Passkeys)

## Oversikt
Legge til støtte for innlogging med biometri (fingeravtrykk, Face ID) via WebAuthn Passkeys. Brukere kan registrere en passkey i sikkerhet-tabben på profilen, og deretter logge inn med biometri på innloggingssiden.

## Teknisk tilnærming

WebAuthn krever server-side verifisering av utfordringer (challenges). Vi bruker en Supabase Edge Function som WebAuthn-server, og en ny database-tabell for å lagre registrerte passkeys.

### 1. Database: `passkeys`-tabell

```sql
create table public.passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  credential_id text unique not null,
  public_key text not null,
  counter bigint default 0,
  device_name text,
  created_at timestamptz default now()
);
alter table public.passkeys enable row level security;
-- Bruker kan bare lese/slette sine egne
create policy "Users manage own passkeys" on public.passkeys
  for all to authenticated using (user_id = auth.uid());
```

### 2. Edge Function: `webauthn`

Ny edge function som håndterer fire operasjoner:
- **register-options**: Generer registreringsutfordring (challenge) med `@simplewebauthn/server`
- **register-verify**: Verifiser registreringsrespons, lagre credential i `passkeys`-tabellen
- **login-options**: Generer autentiseringsutfordring basert på e-post, hent brukerens credentials
- **login-verify**: Verifiser autentiseringsrespons, generer en "sign-in token" eller custom JWT

Bruker `@simplewebauthn/server` (Deno-kompatibel) for kryptografisk verifisering.

**Innlogging**: Etter vellykket WebAuthn-verifisering kaller edge function `supabase.auth.admin.generateLink()` for å opprette en magic link, og returnerer tokenet til klienten som bruker det til å fullføre innlogging via `verifyOtp`.

### 3. Frontend: Passkey-registrering i ProfileDialog

Ny komponent `PasskeySetup.tsx` i sikkerhet-tabben (ved siden av TwoFactorSetup):
- Vis liste over registrerte passkeys med enhetsnavn og opprettet-dato
- "Legg til passkey"-knapp som kaller `navigator.credentials.create()` via `@simplewebauthn/browser`
- Slett-knapp per passkey

### 4. Frontend: Biometrisk innlogging på Auth.tsx

- Ny knapp "Logg inn med biometri" på innloggingssiden (vises kun hvis `window.PublicKeyCredential` er tilgjengelig)
- Be om e-post først, deretter trigger