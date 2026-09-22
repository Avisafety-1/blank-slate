# Lagre dokumentfiler i riktig mappe fremover

## Bakgrunn (avklart med bruker)

- Dokumentet tilhører selskapet/avdelingen det lastes opp fra — dokumentradens `company_id` og filens mappe skal samsvare.
- De 16 eksisterende dokumentene med fil i feil mappe røres IKKE. Tilgangsregelen fra i går (`can_read_document_file` + oppdatert lesepolicy) sikrer at alle kan åpne det de skal — feilen brukerne så er rettet opp.
- Delingsfunksjonen (oppover/nedover i hierarkiet) endres ikke.

## Hva som skal gjøres

### 1. Nye dokumenter: fil lagres i mappen til avdelingen opplastingen skjer fra
- `DocumentUploadDialog.tsx` bruker allerede kontekstens `companyId` som mappe — beholdes, men valider at `companyId` alltid er satt før opplasting (avvis opplasting uten selskap i stedet for å risikere rot-mappe).

### 2. Redigering/erstatt fil: lagre i samme mappe som originalfilen
- `DocumentCardModal.tsx` laster i dag opp uten mappe (rett i roten av arkivet) — det er kilden til filer uten mappenavn.
- Ved erstatting: bruk mappen fra dokumentets eksisterende `fil_url` når den har et mappenavn; ellers dokumentets `company_id`.
- Ved nytt dokument i samme dialog: bruk kontekstens `companyId`, som DocumentUploadDialog.

### 3. Ingen databaseendring, ingen flytting av eksisterende filer
- `can_read_document_file` og SELECT-policyen på `storage.objects` beholdes uendret som sikkerhetsnett for historiske feilplasserte filer.

## Teknisk

- `src/components/documents/DocumentCardModal.tsx`: `uploadFile(file, folderPrefix)` — mappes prefiks utledes fra original `fil_url` (del før første `/`) eller dokumentets `company_id` ved opprettelse.
- `src/components/documents/DocumentUploadDialog.tsx`: guard mot manglende `companyId` før `upload()`.
- i18n: ingen nye bruker synlige strenger forventet; eventuelle feiltekster i både `no.json` og `en.json`.
- Validering: `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`, og opplasting/erstatning testet i forhåndsvisningen.
