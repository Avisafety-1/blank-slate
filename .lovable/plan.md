

## Instagram-integrasjon for Marketing-modulen

Instagram Business API bruker samme Facebook Graph API, men krever et ekstra steg: bilder MÅ lastes opp som container først, deretter publiseres. Instagram støtter IKKE rene tekstinnlegg -- et bilde er alltid påkrevd.

### Forutsetninger (secrets)
- `INSTAGRAM_BUSINESS_ACCOUNT_ID` -- hentes fra Facebook Page settings (Page → Instagram → Connected Account)
- `FACEBOOK_PAGE_ACCESS_TOKEN` -- allerede konfigurert, gjenbrukes (trenger `instagram_basic`, `instagram_content_publish` permissions)

### Endringer

**1. Ny Edge Function: `supabase/functions/publish-instagram/index.ts`**
- Samme mønster som `publish-facebook`
- To-stegs publisering via Graph API:
  1. `POST /{ig-account-id}/media` med `image_url` + `caption` → returnerer `creation_id`
  2. `POST /{ig-account-id}/media_publish` med `creation_id` → returnerer `id`
- Valider at `imageUrl` finnes (påkrevd for Instagram)
- Oppdater draft metadata med `instagram_post_id` og `instagram_post_url`
- Bruker secrets: `FACEBOOK_PAGE_ACCESS_TOKEN` + `INSTAGRAM_BUSINESS_ACCOUNT_ID`

**2. Oppdater `supabase/functions/publish-scheduled/index.ts`**
- Etter Facebook-publisering, sjekk om draft.platform === "instagram"
- Kall Instagram-logikken (same two-step) for planlagte innlegg
- Lagre `instagram_post_id`/`instagram_post_url` i metadata

**3. Oppdater `src/components/marketing/DraftEditorDialog.tsx`**
- Importer `Instagram` ikon (lucide-react)
- Legg til `handlePublishInstagram` funksjon som kaller `publish-instagram` edge function
- Legg til Instagram-publiseringsknapp i DialogFooter (ved siden av Facebook-knappen), med rosa/gradient farge
- Knappen vises kun når det finnes minst ett bilde knyttet til utkastet (Instagram krever bilde)
- Legg til bekreftelses-AlertDialog for Instagram (som Facebook)
- Vis feilmelding hvis bruker prøver å publisere uten bilde

**4. Oppdater `src/components/marketing/MarketingDrafts.tsx`**
- Legg til Instagram-hurtigpubliseringsknapp på godkjente utkast (ved siden av Facebook-knappen)
- Importer Instagram-ikon
- `handleQuickPublishInstagram` som kaller edge function
- Vis "Se"-lenke for publiserte Instagram-innlegg fra metadata

**5. Oppdater `src/components/marketing/MarketingSettings.tsx`**
- Endre Instagram status fra "Planlagt" til "Aktiv"
- Legg til Instagram-konfigurasjonsseksjon (som Facebook-seksjonen) med instruksjoner for å koble Instagram Business Account til Facebook Page og hente `INSTAGRAM_BUSINESS_ACCOUNT_ID`

**6. Oppdater `supabase/config.toml`**
- Legg til `[functions.publish-instagram]` med `verify_jwt = false`

### Secret som må legges til
- `INSTAGRAM_BUSINESS_ACCOUNT_ID` -- brukerens Instagram Business Account ID (hentes fra Facebook Page → Settings → Instagram)

### Begrensninger
- Instagram API krever alltid et bilde (ingen rene tekstinnlegg)
- Bildet må være tilgjengelig via offentlig URL (Supabase storage fungerer)
- Carousel/video støttes ikke i første versjon

