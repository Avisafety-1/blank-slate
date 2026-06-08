## Mål
La brukere laste opp et eget signaturbilde (PNG/JPG) i tillegg til å tegne én, fra profil-siden.

## Endringer

### `src/components/SignaturePad.tsx`
- Legg til en ny knapp "Last opp signatur" ved siden av eksisterende "Tegn signatur"-knapp.
- Skjult `<input type="file" accept="image/png,image/jpeg,image/webp">` som trigges av knappen.
- Ved valg av fil:
  - Validér type (kun bilde) og størrelse (maks ~2 MB).
  - Last opp til samme `signatures` storage-bucket som tegnet signatur, sti `${user.id}/signature_upload_${Date.now()}.<ext>` (`upsert: true`).
  - Hent public URL, oppdater `profiles.signature_url`.
  - Kall `onSave(url)` og vis toast "Signatur lastet opp".
- Bruker eksisterende `useAuth()` for `user.id` (samme mønster som `SignatureDrawerDialog.handleSave`).
- Loading-state på upload-knappen mens den laster opp.

### Ingen andre filer endres
- `SignatureDrawerDialog` forblir uendret (brukes for tegning).
- `ProfileDialog` trenger ingen endring — den bruker allerede `SignaturePad` og får oppdatert URL via `onSave`.
- Bucket `signatures` og RLS finnes allerede (brukes av tegne-flyten).

## UI-layout
To knapper stablet vertikalt under eksisterende preview:
- "Tegn signatur" (eksisterende, primær stil beholdt)
- "Last opp signatur" (outline, med Upload-ikon fra lucide-react)
