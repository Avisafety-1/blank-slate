

# Plan: Passkey-innlogging uten e-post (Discoverable Credentials)

## Problemet
I dag må brukeren skrive inn e-post før biometrisk innlogging. Nettleseren/OS-et vet allerede hvilke passkeys som er tilgjengelige — e-posten er overflødig.

## Løsning: Discoverable Credentials
WebAuthn støtter «discoverable credentials» der passkeyen selv inneholder brukerens identitet. Da kan serveren generere autentiseringsopsjoner *uten* å vite hvem brukeren er — nettleseren viser alle tilgjengelige passkeys, og svaret inneholder brukerens ID.

## Endringer

### 1. Edge Function (`supabase/functions/webauthn/index.ts`)

**Registrering** — sett `userID` eksplisitt til brukerens UUID (ellers genererer biblioteket en tilfeldig ID som ikke kan kobles tilbake):
```typescript
const options = await generateRegistrationOptions({
  ...existing,
  userID: new TextEncoder().encode(userId), // ← nytt
  authenticatorSelection: {
    residentKey: "required",        // ← endret fra "preferred"
    userVerification: "preferred",
  },
});
```

**Ny action: `login-options-discoverable`** — genererer opsjoner uten e-post/allowCredentials:
```typescript
if (action === "login-options-discoverable") {
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    // Ingen allowCredentials → nettleseren viser alle passkeys for denne RP
  });
  // Sign challenge uten userId (vi vet det ikke ennå)
  return json({ options, signedChallenge });
}
```

**Oppdater `login-verify`** — hent userId fra credential i stedet for fra challenge:
- Slå opp passkey i DB kun på `credential_id` (uten userId-filter)
- Hent `user_id` fra den lagrede passkeyen
- Fortsett med magic link som før

### 2. Frontend (`src/pages/Auth.tsx`)

- Fjern e-post-dialogen for passkey-innlogging
- Knappen «Logg inn med biometri» kaller direkte `login-options-discoverable` → `startAuthentication` → `login-verify`
- Ingen e-postfelt, ingen ekstra dialog — ett klikk → biometri → innlogget

### 3. Viktig merknad
Brukere som allerede har registrert en passkey med den gamle metoden (residentKey: "preferred") må slette den og registrere på nytt for at discoverable credentials skal fungere. Vi legger til en melding om dette.

