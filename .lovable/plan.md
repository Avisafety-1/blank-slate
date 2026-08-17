# Hvorfor bare du får e-post om ventende brukere i Hide

## Hva jeg fant (bekreftet mot databasen)

De tre andre administratorene i Hide industry (an@, ljn@, rb@hideindustry.com) og admin i Avdeling A (mh@hideindustry.com) har alle `email_new_user_pending = false` i varselinnstillingene sine. Din bruker har `true`. Det er ikke avdeling eller rolle som stopper e-posten — det er varselvalget.

Årsaken til at det står `false`: databasen har standardverdi `true`, men appen overstyrer den. Første gang en bruker åpner Profil-dialogen, og det ikke finnes en rad i `notification_preferences`, opprettes raden fra frontend med `email_new_user_pending: false` hardkodet. Alle nye brukere får altså varselet av som standard, uten å ha slått det av selv.

Til info: varselet «Ny bruker venter på godkjenning» for et morselskap sendes til morselskapets admins via `email_child_new_user_pending` (som står `true` hos alle fire). Admins i en underavdeling får ikke varsel om brukere som registrerer seg i morselskapet — det er tilsiktet.

## Foreslått løsning

1. Rett standardverdien i frontend: når `notification_preferences` opprettes ved første åpning av profilen, skal `email_new_user_pending` settes til `true` (samsvarer med databasens default), i `src/components/ProfileDialog.tsx`.
2. Rett også visnings-fallbacken samme sted, slik at bryteren viser `true` når verdien mangler (i dag `?? false`).
3. Engangsopprydding via migrasjon: sett `email_new_user_pending = true` for eksisterende administratorer/superadmins som aldri har slått den av bevisst. Fordi vi ikke kan skille «aldri rørt» fra «slått av med vilje», foreslår jeg å begrense oppdateringen til brukere med rolle `administrator`/`superadmin`. Alternativt kan vi la den stå og heller be de tre i Hide skru den på selv i Profil → Varsler.

## Teknisk

- Fil: `src/components/ProfileDialog.tsx` (insert-blokken rundt linje 485 og bryter-fallback rundt linje 1936).
- Migrasjon (valgfritt, punkt 3): `UPDATE public.notification_preferences np SET email_new_user_pending = true FROM public.user_roles ur WHERE ur.user_id = np.user_id AND ur.role IN ('administrator','superadmin');`
- Ingen endring i `supabase/functions/send-notification-email/index.ts` — mottakerlogikken der er korrekt.

## Spørsmål før jeg bygger

Skal jeg kjøre engangsoppryddingen for alle admins på plattformen (punkt 3), eller kun rette standardverdien fremover?
