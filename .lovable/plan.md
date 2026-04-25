Jeg fant sannsynlig årsak: dokumentradene er delt globalt (`global_visibility = true`), så de vises for andre selskaper, men Storage-policyen for `documents`-bøtten tillater bare filer i eget/synlig selskap eller `visible_to_children = true`. Den sjekker ikke `global_visibility`, derfor feiler åpning/nedlasting av globalt delte filer.

Plan:

1. Oppdater Storage RLS for dokumentfiler
   - Endre SELECT-policyen på `storage.objects` for `documents`-bøtten slik at autentiserte brukere kan lese filen når tilhørende rad i `public.documents` har `global_visibility = true`.
   - Behold eksisterende tilgang for eget selskap, hierarki og `visible_to_children`.
   - Ikke åpne bøtten offentlig; tilgang skal fortsatt gå via autentisering og signerte URL-er.

2. Sikre konsekvent lagringssti
   - Kontrollere at nye dokumenter fortsatt lagres som `{company_id}/{filnavn}`.
   - For eksisterende globalt delte dokumenter med eldre filsti uten company-prefix, la policyen også dekke dem via kobling mot `documents.fil_url = storage.objects.name`.

3. Forbedre feilmelding ved åpning/nedlasting
   - I dokumentlisten og dokumentmodalen: vis en mer presis melding hvis signert URL eller nedlasting feiler på grunn av tilgang, f.eks. «Du har tilgang til dokumentkortet, men filtilgangen mangler. Kontakt administrator.»
   - Logg fortsatt teknisk feil i konsollen.

4. Verifisering
   - Test med de tre aktuelle Avisafe-dokumentene:
     - `ai-risikovurdering-dokumentasjon.pdf`
     - `sora-tilstøtende-områder-dokumentasjon_v2.pdf`
     - `SORA-Buffersoner-Dokumentasjon.pdf`
   - Bekreft at en administrator i et annet selskap kan se dokumentkortet og åpne/laste ned PDF-en.

Teknisk detalj:

Policyen bør utvides med en `EXISTS`-sjekk mot `public.documents`:

```sql
EXISTS (
  SELECT 1
  FROM public.documents d
  WHERE d.fil_url = storage.objects.name
    AND d.global_visibility = true
)
```

Dette løser forskjellen mellom metadata-tilgang (`public.documents`) og faktisk filtilgang (`storage.objects`).