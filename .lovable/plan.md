## Problem

Opplasting til `storage.avatars/{uid}/*.jpeg` feiler med 403 «new row violates row-level security policy», selv om filnavnet starter med innlogget brukers UUID.

## Rotårsak

INSERT/UPDATE/DELETE-policyene for `avatars`-bucketen er definert mot rolle `public` i stedet for `authenticated`. På Storage-objekter forventes `auth.uid()`-baserte sjekker å kjøre i `authenticated`-rollen. Når policyen ligger på `public` matcher den ikke det aktuelle JWT-tilfellet i Storage-laget, og INSERT avvises før WITH CHECK-uttrykket gir mening. Dette er nøyaktig samme mønster Lovable-knowledgebasen flagger: «Ensure policies are explicitly set TO authenticated».

## Endring

Én Supabase-migrasjon som dropper og gjenoppretter de tre eksisterende `avatars`-policyene med korrekt rolle og presis logikk. Ingen kodeendringer.

```sql
-- Re-create avatars policies scoped to authenticated
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (auth.uid())::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);
```

SELECT trengs ikke — bucketen er public, så `getPublicUrl` fungerer uten egen policy.

## Verifikasjon

Etter migrasjon: last opp profilbilde for support@avisafe.no.
- Forventet: filen havner i `avatars/6ac7537b-…/…jpeg`, `profiles.avatar_url` settes, grønn toast.
- Hvis det fortsatt feiler får du nå tydelig feiltoast (fra forrige fix) med faktisk årsak.

## Ikke endret

- Bucket-config (`avatars` er fortsatt public, ingen mime/size-grense).
- Andre buckets sine policyer.
- Frontend-koden (allerede fikset i forrige runde).
