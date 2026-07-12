## Problem
Invitasjons-e-posten kommer på norsk selv når mål-selskapet har `default_language = 'en'`.

## Rotårsak
`invokeEmailFunction`-wrapperen legger alltid inn `language: i18n.language` fra invitererens UI i request body. Min forrige `invite-user`-endring lot `body.language` vinne over mål-selskapets språk, så avsenderens norske UI overstyrte mottakerens engelske selskap.

## Fix
I `supabase/functions/invite-user/index.ts`: la mål-selskapets `default_language` **vinne** over `body.language`, siden invitasjonen sendes til mottaker i det selskapet — ikke til avsender. Rekkefølge blir:

1. `targetCompanyLang` (fra `companies.default_language` for `registration_code`) — hvis satt
2. `body.language` (fra kaller)
3. `Accept-Language`-header / default `'no'` (via `resolveLanguage`)

Konkret: bytt ut den nåværende `bodyForLang`/`resolveLanguage`-blokken slik at `language = targetCompanyLang ?? resolveLanguage(req, body)`.

## Filer
- `supabase/functions/invite-user/index.ts` (én endring)

## Verifisering
Etter fix: kall `invite-user` mot «Engelsk testselskap»'s registreringskode → sjekk edge function-loggen og at maldata brukes fra `defaultTemplatesByLang.en.user_invite`.
