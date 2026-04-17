

## Rotårsak (bekreftet)

`storage.objects` SELECT for `documents`-bøtten bruker `get_user_visible_company_ids(auth.uid())`, som returnerer:
- Eget selskap + barn (hvis admin), eller
- Kun eget selskap

Den returnerer **ikke mor-selskapet**. Filen for sjekklisten ligger i `af43f04e-.../...` (mor-selskapet "Moderavdeling"), mens brukeren er i en underavdeling. Derfor feiler `createSignedUrl` → ny feilmelding "Kunne ikke laste sjekklistefilen".

`documents`-tabellen har derimot en ekstra SELECT-klausul som tillater visning når `visible_to_children=true AND company_id = parent`. Det er denne logikken som mangler i storage-policyen.

## Løsning

Speil `documents`-tabellens SELECT-logikk i `storage.objects`-policyen for `documents`-bøtten. Ingen "synlig for alle" — kun samme arv-regel som allerede finnes på dokument-raden:

> Bruker kan signere fil hvis filen ligger i en mappe (`{company_id}`) som enten:
> - er i `get_user_visible_company_ids(auth.uid())`, **ELLER**
> - er mor-selskapet til brukerens selskap **OG** det finnes en dokument-rad med `fil_url = name AND visible_to_children = true`

Den andre delen sjekker at det faktisk finnes en delt dokument-rad som peker på filen — så vi gir ikke generell lesetilgang til hele mor-selskapets storage-mappe, kun til filer som er eksplisitt delt via `visible_to_children=true`.

### Migrasjon

```sql
DROP POLICY "Users can read own company documents" ON storage.objects;

CREATE POLICY "Users can read own company documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents' AND (
    -- Eget eller barn-selskap (eksisterende regel)
    (storage.foldername(name))[1] IN (
      SELECT unnest(get_user_visible_company_ids(auth.uid()))::text
    )
    OR
    -- Delt fra mor via visible_to_children
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.fil_url = storage.objects.name
        AND d.visible_to_children = true
        AND d.company_id = get_parent_company_id(
          (SELECT company_id FROM profiles WHERE id = auth.uid())
        )
    )
  )
);
```

### Filer
- Ny migrasjon for `storage.objects` SELECT-policy på `documents`-bøtten
- Ingen UI-endringer trengs — `ChecklistExecutionDialog` håndterer allerede PDF-modus korrekt fra forrige iterasjon

### Verifisering
- Åpne oppdrag i underavdeling med sjekkliste fra mor-selskap → PDF-knapp + "Marker utført" skal vises
- Verifiser at andre filer i mor-selskapet (uten `visible_to_children=true`) fortsatt er blokkert

