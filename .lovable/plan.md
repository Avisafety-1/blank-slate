## Problem

For support@avisafe.no (og potensielt andre):
- Du velger bilde, ser preview, trykker «Lagre», får grønn «Profil oppdatert».
- Men `profiles.avatar_url` er fortsatt `NULL` og ingen fil finnes i `storage.avatars/{user.id}/`.

## Rotårsak

I `src/components/ProfileDialog.tsx` (`uploadAvatar` / `handleSaveProfile`, linje 468–532) håndteres opplastings­feil for mykt:

1. `uploadAvatar()` fanger feil internt, viser `toast.error(...)` og returnerer `null`.
2. `handleSaveProfile()` ser at `newAvatarUrl` er `null`, men **fortsetter** og oppdaterer profilen uten avatar.
3. Til slutt vises `toast.success('Profil oppdatert')` som overlapper/erstatter den røde toasten visuelt — så det «ser ut til å fungere».

Bucket og RLS er korrekte (bucket `avatars` er public, INSERT/UPDATE-policy matcher `auth.uid()::text = foldername[1]`, ingen mime/size-grenser). Feilen kommer fra selve upload-kallet og blir effektivt skjult.

## Endringer

Kun frontend, i `src/components/ProfileDialog.tsx`:

1. **Kast feil ut av `uploadAvatar`** i stedet for å returnere `null`. Behold logging, men la `handleSaveProfile` bestemme hva som skjer.
2. **I `handleSaveProfile`**: pakk avatar-opplastingen i egen try, og hvis den feiler:
   - vis tydelig feiltoast med faktisk feilmelding (`error.message`)
   - **abort** — ikke kjør profil-UPDATE, ikke vis grønn success-toast, ikke nullstill `avatarFile` (så brukeren kan prøve igjen uten å velge på nytt).
3. **Sanitér filnavn**: bruk lowercase ext, fallback til `png` hvis mangler, og rens filnavn for spesialtegn — unngår at f.eks. `Skjermbilde 2024-…png` eller manglende ext gir 400 fra Storage.
4. **Cache-busting**: legg `?v={Date.now()}` på `avatarUrl` som lagres i `profiles.avatar_url`, så nytt bilde vises umiddelbart selv om nettleseren har cachet gammel public URL.
5. **Console-logging** av faktisk Storage-feil (status, message, name) så vi kan diagnostisere videre hvis det fortsatt feiler etter fix.

## Hvordan vi verifiserer

- Last opp en PNG på nytt på `support@avisafe.no` etter fix.
- Forventet: grønn «Profil oppdatert» **kun** hvis filen faktisk lå i `storage.avatars/{uid}/...` og `profiles.avatar_url` ble satt.
- Hvis det feiler, får du nå en tydelig rød toast med årsak (f.eks. «new row violates row-level security», «Payload too large», nettverksfeil) — som forteller oss neste steg.

## Ikke endret

- Ingen DB-/RLS-/bucket-endringer (de er allerede korrekte).
- Ingen endringer i andre profil-felter eller lagringsflyt utenom avatar.
