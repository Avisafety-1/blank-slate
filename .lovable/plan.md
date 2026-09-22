# Skrivetilgang til dokumentfiler på tvers av avdelinger

## Bakgrunn
Lesetilgangen til dokumentfiler ble nylig utvidet til å følge dokumentdelingen (eget selskap, avdelinger under deg, delt nedover, eksplisitt deling). Skrivereglene i filarkivet er ikke oppdatert tilsvarende: de krever at mappenavnet filen ligger i er lik brukerens eget hjemmeselskap. En administrator som hører hjemme i moravdelingen kan derfor ikke laste opp, erstatte eller slette filer mens vedkommende står i en underavdeling — opplastingen avvises.

## Mål
Skriveregler for dokumentfiler skal følge samme hierarki som resten av systemet: administratorer kan skrive i mapper som tilhører eget selskap og avdelinger under seg (samme liste som brukes til lesing andre steder).

## Endringer (database)

1. Ny hjelpefunksjon `public.can_write_document_folder(_folder text)` (SECURITY DEFINER, STABLE, `search_path = public`):
   - Returnerer true dersom `_folder` (første mappenivå, en company-uuid) er i `get_user_visible_company_ids(auth.uid())` **og** brukeren har administrator- eller superadmin-rolle.
   - `REVOKE EXECUTE ... FROM anon, authenticated, PUBLIC` og `GRANT EXECUTE TO authenticated` i samme migrasjon (per prosjektkonvensjon).

2. Utvide eksisterende policyer på `storage.objects` for `bucket_id = 'documents'` — kun utvidende, dagens regel beholdes:
   - INSERT «Users can upload to own company folder»: legg til `OR can_write_document_folder(foldername[1])` i WITH CHECK.
   - UPDATE og DELETE «Users can update/delete own company documents»: samme utvidelse i USING/WITH CHECK.
   - Superadmin-policyene røres ikke.

3. Ingen endring i lesepolicyen eller i `can_read_document_file`. Ingen data røres.

## Konsekvens
- Administrator i moravdeling kan laste opp/erstatte/slette filer i underavdelingers mapper — samme rettigheter som hen allerede har på dokumentradene.
- Vanlige brukere (uten administratorrolle) får ingen nye rettigheter.
- Oppadgående skriving (underavdeling → morselskap) forblir stengt.

## Verifisering
- Test-opplasting i underavdelings mappe som mor-admin etter migrasjon.
- Bekreft at bruker uten admin-rolle fortsatt avvises.
- `git diff --check` og typesjekk (ingen frontend-endringer forventes).
