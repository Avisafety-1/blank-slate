

## Direkte bildeopplasting uten AI-behandling

### Hva
Legg til en "Last opp bilde"-knapp i to steder:
1. **MarketingVisuals.tsx** (mediebiblioteket) — en ny knapp ved siden av "Generer visuell"
2. **DraftEditorDialog.tsx** (DraftVisualSection) — en ny knapp "Last opp" ved siden av "Fra bibliotek" og "Generer ny"

### Hvordan

**DraftVisualSection** (linje ~138-150 i DraftEditorDialog.tsx):
- Legg til en "Last opp"-knapp med skjult `<input type="file">`
- Ved filopplasting: Last opp til `marketing-media` storage bucket under `{companyId}/uploads/`, sett inn rad i `marketing_media` med `source_type: 'upload'`, `draft_id` satt til gjeldende utkast
- Ingen AI-kall involvert

**MarketingVisuals.tsx** (linje ~54-57):
- Legg til en "Last opp bilde"-knapp ved siden av "Generer visuell"
- Samme opplastingslogikk: lagre i bucket, opprett `marketing_media`-rad med `source_type: 'upload'`

### Tekniske detaljer
- Bruker eksisterende `marketing-media` storage bucket
- Setter `source_type = 'upload'` for å skille fra AI-genererte bilder
- `useAuth()` gir `companyId` og bruker-ID
- Ingen nye tabeller eller edge functions trengs — ren klientside-opplasting direkte til Supabase Storage + insert i `marketing_media`

