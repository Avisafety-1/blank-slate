

# Plan: Valgfri 2FA med Authenticator-app

## Oversikt
Legge til valgfri tofaktorautentisering (TOTP) i sikkerhet-tabben på profilen. Bruker Supabase Auth sin innebygde MFA-støtte (TOTP). Ved innlogging sjekkes det om brukeren har 2FA aktivert, og i så fall må de taste inn kode fra authenticator-appen.

## Teknisk tilnærming

Supabase Auth har innebygd TOTP MFA via `supabase.auth.mfa.*` API-ene. Ingen database-endringer trengs.

### 1. Sikkerhet-tab i ProfileDialog — 2FA-oppsett

Legge til en ny seksjon i security-tabben (`src/components/ProfileDialog.tsx` linje ~1023-1044) med:

- **Vis status**: Sjekk `supabase.auth.mfa.listFactors()` for å vise om TOTP er aktivert
- **Aktiver-flyt**:
  1. Kall `supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator' })`
  2. Vis QR-kode (returnert som `totp.qr_code` data-URI) + hemmelig nøkkel for manuell inntasting
  3. Bruker skanner QR og taster inn verifiseringskode
  4. Kall `supabase.auth.mfa.challengeAndVerify({ factorId, code })` for å bekrefte
- **Deaktiver-flyt**: Kall `supabase.auth.mfa.unenroll({ factorId })` med bekreftelsesdialog

Opprette en egen komponent `TwoFactorSetup.tsx` for å holde logikken ryddig.

### 2. Innloggingsflyt — MFA-utfordring (Auth.tsx)

Etter `signInWithPassword` sjekke om responsen indikerer MFA er påkrevd:
- Supabase returnerer en session med `session.user` men MFA-nivået er `aal1` (ikke `aal2`)
- Sjekk `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` — hvis `nextLevel === 'aal2'` og `currentLevel === 'aal1'`, vis MFA-verifiseringsdialog
- Bruker taster inn 6-sifret kode fra authenticator-appen
- Kall `supabase.auth.mfa.challenge({ factorId })` deretter `supabase.auth.mfa.verify({ factorId, challengeId, code })`
- Ved suksess: fortsett normal redirect

Opprette en `MfaChallengeDialog.tsx` komponent som vises over innloggingsskjermen.

### 3. Nye filer

| Fil | Innhold |
|-----|---------|
| `src/components/TwoFactorSetup.tsx` | QR-oppsett, verifisering, unenroll — brukes i ProfileDialog sikkerhet-tab |
| `src/components/MfaChallengeDialog.tsx` | 6-sifret OTP-input ved innlogging, bruker `InputOTP`-komponenten som allerede finnes |

### 4. Endrede filer

| Fil | Endring |
|-----|---------|
| `src/components/ProfileDialog.tsx` | Importere og rendre `TwoFactorSetup` i security-tabben |
| `src/pages/Auth.tsx` | Etter signInWithPassword, sjekke AAL-nivå og vise `MfaChallengeDialog` |
| `src/i18n/locales/no.json` | Nye oversettelsesnøkler for 2FA |
| `src/i18n/locales/en.json` | Nye oversettelsesnøkler for 2FA |

### 5. Supabase-konfigurasjon

MFA må være aktivert i Supabase-dashboardet under Authentication → Multi-Factor Authentication. Dette er en innstilling i Supabase-prosjektet, ikke i koden.

