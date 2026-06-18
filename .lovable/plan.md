# Plan: Migrer til Supabase native passkeys — FERDIG

Implementert i denne sesjonen:

1. Oppgradert `@supabase/supabase-js` til ^2.105 (faktisk 2.108.2)
2. Aktivert `experimental: { passkey: true }` i `src/integrations/supabase/client.ts`
3. Rewrote `src/components/PasskeySetup.tsx` til å bruke `supabase.auth.registerPasskey()` + `supabase.auth.passkey.list()/.delete()`
4. Rewrote `src/components/PasskeyPromptDialog.tsx` på samme måte
5. Rewrote passkey-login i `src/pages/Auth.tsx` til `supabase.auth.signInWithPasskey()`
6. Fjernet `@simplewebauthn/browser` fra `package.json`
7. Slettet `supabase/functions/webauthn/` + avregistrert Edge Function
8. Dropet `public.passkeys`-tabellen
9. Eksisterende 55 passkeys må re-registreres av brukere (engangs)
