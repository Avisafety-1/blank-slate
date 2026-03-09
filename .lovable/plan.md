

## Problem

Lenken i e-posten peker til Supabase sin `/verify`-endpoint:
`https://pmucsvrypogtttrajqxq.supabase.co/auth/v1/verify?token=TOKEN&type=recovery&redirect_to=.../reset-password`

Når e-postskanneren klikker denne, forbrukes tokenet server-side. Brukeren får deretter "utløpt" fordi tokenet allerede er brukt.

Mellomside-tilnærmingen beskytter ikke mot dette fordi token-forbruket skjer på Supabase-serveren, ikke i appen.

## Løsning

Bytt til **klient-side token-verifisering** i stedet for server-side:

1. **Edge function (`send-password-reset`)**: Ekstraher `token_hash` fra `action_link` URL-en, og bygg en egendefinert lenke som peker direkte til appen: `https://login.avisafe.no/reset-password?token_hash=HASH`
2. **Frontend (`ResetPassword.tsx`)**: Les `token_hash` fra URL query params. Når brukeren klikker "Verifiser", kall `supabase.auth.verifyOtp({ token_hash, type: 'recovery' })` for å verifisere klient-side.

```text
Nåværende flyt (sårbar):
E-post → Supabase /verify (token forbrukt!) → /reset-password

Ny flyt (skannersikker):
E-post → /reset-password?token_hash=X (ingen token-forbruk)
  → Bruker klikker "Verifiser"
  → Frontend kaller verifyOtp() (token forbrukt først NÅ)
```

### Endringer

**`supabase/functions/send-password-reset/index.ts`**
- Etter `generateLink`, parse `action_link` URL og ekstraher `token` query-parameteren
- Bygg ny lenke: `https://login.avisafe.no/reset-password?token_hash=${token}`
- Bruk denne nye lenken som `reset_link` i e-postmalen (i stedet for `data.properties.action_link`)

**`src/pages/ResetPassword.tsx`**
- Les `token_hash` fra `window.location.search` (URL query params)
- I `startVerification()`: Kall `supabase.auth.verifyOtp({ token_hash, type: 'recovery' })` i stedet for å lytte på hash-fragments og auth state changes
- Hvis `verifyOtp` lykkes → vis passordskjema
- Hvis det feiler → vis "Send ny link"-skjema
- Hvis ingen `token_hash` i URL → vis "Send ny link" direkte (brukeren kom hit uten gyldig lenke)

