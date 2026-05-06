## Rotårsak (bekreftet)

`send-password-reset` returnerer 200 OK uten å sende mail. Edge-loggen viser kun "booted" — ingen Resend-kall, ingen feil. Forrige fix (smtp_user) gjorde at funksjonen ikke krasjer lenger, men problemet ligger et annet sted:

```ts
const { data: { users } } = await supabase.auth.admin.listUsers();
const user = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
if (!user) return 200; // stille
```

`listUsers()` uten paginering returnerer **default 50 brukere per side**. Databasen har **76 brukere** (verifisert via SQL). Brukere som ligger på side 2+ blir aldri funnet → funksjonen returnerer "Hvis e-posten finnes …" uten å sende mail. Det forklarer 100% av symptomene.

## Resend-bruken og reset-lenken

Begge er korrekte:
- `_shared/resend-email.ts` POSTer riktig til `https://api.resend.com/emails` med `Authorization: Bearer RESEND_API_KEY` og `from/to/subject/html`. Standard Resend HTTP API.
- Reset-lenken bygges fra `auth.admin.generateLink({ type: 'recovery', redirectTo: 'https://login.avisafe.no/reset-password' })`, deretter `?token_hash=…&type=recovery`. `ResetPassword.tsx` plukker opp `token_hash` og kaller `verifyOtp({ type: 'recovery' })` — riktig flyt.

Når mailen først kommer frem, vil lenken fungere.

## Endring

Fil: `supabase/functions/send-password-reset/index.ts`

Bytt det enkle `listUsers()`-kallet med en paginert løkke (perPage 1000, opp til siden er tom eller bruker er funnet). Legg til en `console.log` ved funn / ikke-funn slik at edge-loggen viser hva som faktisk skjer.

Ingen andre filer berøres. Ingen DB-endringer.

## Verifisering etterpå

1. Trykk "Send ny link" / "Glemt passord" igjen.
2. Sjekk edge-loggen — skal nå vise `Found user … generating reset link` og deretter Resend-respons.
3. Mottatt e-post → klikk lenken → kommer til `/reset-password?token_hash=…` → verifiserer og lar deg sette nytt passord.