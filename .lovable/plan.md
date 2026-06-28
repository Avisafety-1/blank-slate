## Mål
Superadmin skal kunne laste opp ett bilde per endringslogg-innlegg via opprett/rediger-dialogen. Bildet vises på innleggets kort i listen.

## Endringer

### 1. Database (migration)
- Legg til kolonne `image_url text` på `changelog_entries`.
- Opprett offentlig storage-bucket `changelog-images` (public read).
- Storage-policies: SELECT for alle, INSERT/UPDATE/DELETE kun for superadmin (via `has_role(auth.uid(), 'superadmin')`).

### 2. `src/pages/Changelog.tsx`
- Utvid `ChangelogEntry` med `image_url: string | null`.
- I entry-dialogen (kun redigeringsmodus / opprettmodus, som allerede er superadmin-gated):
  - Nytt "Bilde"-felt: filinput + forhåndsvisning.
  - Knapp "Fjern bilde" hvis bilde finnes.
  - Ved valg av fil: last opp til `changelog-images/<entryId-eller-uuid>-<timestamp>.<ext>`, hent public URL, lagre i form-state.
  - `saveEntry` lagrer `image_url` sammen med øvrige felter.
- I listevisningen: hvis `entry.image_url` finnes, render en liten thumbnail (f.eks. `max-h-32 rounded-md`) under beskrivelsen. Klikk åpner full størrelse i en enkel `Dialog`.
- Ingen visuelle endringer i lesemodus utover at bildet vises hvis det finnes.

## Tekniske detaljer
- Bruk eksisterende `supabase.storage.from('changelog-images').upload(...)` + `getPublicUrl`.
- Filvalidering: kun `image/*`, maks ~5 MB; ellers `toast.error`.
- Gamle bilder slettes ikke automatisk ved bytte (enkelhet) — kan utvides senere.
