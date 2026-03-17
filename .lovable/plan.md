

## Analyse

Feilen "Kunne ikke åpne dokumentet" kommer fra `catch`-blokken i `handleOpenFile` der `createSignedUrl()` kaster en feil. Dette **er** et RLS-problem på storage-bøtten `documents`.

Storage SELECT-policyen (fra migration `20251128134059`) sjekker:
```sql
(storage.foldername(name))[1] = (
  SELECT company_id::text FROM profiles WHERE id = auth.uid()
)
```

Dette tillater kun tilgang til filer i brukerens **eget** selskaps mappe. Moderselskap-admin som ikke er superadmin kan ikke lese filer fra `{child_company_id}/...`.

**Hvorfor nedlasting kanskje så ut til å fungere:** Enten ble et annet dokument (fra eget selskap) testet, eller feilen ble tolket annerledes. Begge operasjoner (`download()` og `createSignedUrl()`) krever samme SELECT-tilgang og vil feile med samme RLS-begrensning.

## Løsning

Oppdater storage SELECT-policyen til å bruke `get_user_visible_company_ids()` — samme funksjon som allerede brukes for `documents`-tabellen (migration `20260316153849`).

### Database-migrasjon

```sql
DROP POLICY IF EXISTS "Users can read own company documents" ON storage.objects;

CREATE POLICY "Users can read own company documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] IN (
    SELECT unnest(get_user_visible_company_ids(auth.uid()))::text
  )
);
```

Ingen kodeendringer. Superadmin-policyen forblir uendret. INSERT/UPDATE/DELETE-policies forblir begrenset til eget selskap (riktig oppførsel).

