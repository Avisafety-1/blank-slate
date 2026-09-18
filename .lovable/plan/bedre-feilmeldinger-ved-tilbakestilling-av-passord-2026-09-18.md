# Bedre feilmeldinger ved tilbakestilling av passord

To problemer på siden der man setter nytt passord:

1. Når passordet avvises (for eksempel fordi det er det samme som det forrige), vises den rå tekniske teksten fra innloggingstjenesten, sammen med en påstand om at lenken er brukt opp — noe som som regel ikke stemmer.
2. Uansett hva som gikk galt, sendes brukeren videre til siden «Send ny tilbakestillingslenke», selv om han bare trenger å prøve et annet passord. Han mister da lenken sin unødvendig.

## Hva som endres

**Forståelige meldinger.** Vanlige årsaker oversettes til klar norsk/engelsk tekst:
- Samme passord som før: «Du kan ikke gjenbruke ditt forrige passord. Velg et nytt passord.»
- For svakt eller for kort passord: «Passordet er for svakt. Følg kravene i listen over.»
- Passordet er funnet i kjente passordlekkasjer: «Dette passordet er for vanlig. Velg et annet.»
- For mange forsøk på kort tid: «For mange forsøk. Vent litt og prøv igjen.»
- Lenken er utløpt eller allerede brukt: «Lenken er utløpt eller allerede brukt. Be om en ny.»
- Ukjent feil: en generell, rolig melding uten teknisk tekst.

**Bli værende på skjemaet.** Når feilen er noe brukeren kan rette selv (passordet avvist, for svakt, for mange forsøk), blir han stående på «Sett nytt passord» med feltene tømt og kan prøve på nytt med en gang. Bare når lenken faktisk er utløpt eller ugyldig, sendes han videre til «Send ny tilbakestillingslenke».

**Riktig avslutning.** Ved vellykket bytte fungerer det som i dag: bekreftelse og videre til innloggingssiden.

## Teknisk

- `src/pages/ResetPassword.tsx`: `handleResetPassword` skiller nå mellom gjenopprettbare feil og tokenfeil. Ved gjenopprettbar feil beholdes `stage: "verified"` og gjenopprettingsøkten logges **ikke** ut (i dag kalles `signOut` i `finally` uansett, noe som gjør et nytt forsøk umulig). `signOut({ scope: "local" })` kjøres fortsatt ved suksess og ved tokenfeil.
- Ny hjelpefil `src/lib/resetPasswordError.ts` etter mønster av `src/lib/acknowledgeError.ts`: tar imot feilen fra `supabase.auth.updateUser` og returnerer `{ messageKey, recoverable }` basert på feilkode/tekst (`same_password`, `weak_password`, `over_request_rate_limit`, `session_not_found` / `invalid token` osv.).
- Nye i18n-nøkler under `auth.resetPassword2.errors.*` i både `no.json` og `en.json`; `couldNotUpdateWithMsg` (som eksponerer rå tekst) tas ut av bruk.
- Validering: `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
