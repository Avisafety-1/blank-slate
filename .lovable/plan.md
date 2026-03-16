

# Fix: 2FA bypass ved Google-innlogging og race condition

## Problemet
To separate problemer:

1. **Google-innlogging hopper over 2FA helt** — `checkGoogleUserProfile` redirecter godkjente brukere direkte uten å sjekke MFA-nivå.
2. **Vanlig innlogging «blinker» MFA-dialogen** — Login-handleren setter `showMfaChallenge = true`, men `useEffect` på linje 167-177 ser at `user` finnes og redirecter umiddelbart. Race condition.

## Løsning

### `src/pages/Auth.tsx`

**1. Legg til MFA-sjekk for Google OAuth-brukere (linje ~128-143):**
Før redirect, sjekk `mfa.getAuthenticatorAssuranceLevel()`. Hvis `nextLevel === 'aal2'` og `currentLevel === 'aal1'`, vis `MfaChallengeDialog` i stedet for å redirecte.

**2. Blokker auto-redirect når MFA er påkrevd (linje ~167-177):**
Legg til `showMfaChallenge` som en betingelse som hindrer redirect:
```typescript
if (authLoading || checkingGoogleUser || showGoogleRegistration || showMfaChallenge) return;
```

Og for ikke-OAuth brukere, sjekk MFA-nivå før redirect:
```typescript
if (!isOAuthUser && user) {
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalData?.nextLevel === 'aal2' && aalData?.currentLevel === 'aal1') {
    setShowMfaChallenge(true);
    return;
  }
  redirectToApp('/');
}
```

### Resultat
- Google-brukere med 2FA må verifisere kode før de kommer inn
- Vanlige brukere ser MFA-dialogen stabilt uten at den «blinker» bort

