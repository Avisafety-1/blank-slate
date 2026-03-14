

## Vedlegg for kompetansebevis med dokument-velger

### Oversikt

Legg til `fil_url`-kolonne på `personnel_competencies` for å lagre vedlegg. Brukeren kan enten laste opp fil direkte (inkl. kamerabilde på mobil) eller velge eksisterende dokument fra /dokumenter via `AttachmentPickerDialog`.

### Database

```sql
ALTER TABLE public.personnel_competencies ADD COLUMN fil_url text;
```

### Lagring

Filer lastes opp til `logbook-images`-bøtten (eksisterende, public, har RLS). Sti: `{company_id}/competency-{competency_id}-{timestamp}.{ext}`. Aksepterte typer: bilder + PDF.

Når bruker velger fra /dokumenter: lagre dokumentets `fil_url` direkte (referanse til `documents`-bøtten).

### UI-endringer

**`PersonCompetencyDialog.tsx`**

*Add-form (linje 464-546):*
- Ny state: `newFile`, `newDocumentUrl`
- Fil-input med `accept="image/*,application/pdf"` og `capture="environment"` for kamera
- «Velg fra dokumenter»-knapp som åpner `AttachmentPickerDialog` — ved valg lagres dokumentets `fil_url`
- Etter insert: last opp lokal fil → oppdater `fil_url` på competency-raden
- Reset fil-state etter vellykket lagring

*View-mode (linje 376-457):*
- Vis vedleggslenke/ikon (Paperclip) hvis `fil_url` finnes
- Klikk åpner fil i ny fane (via `getPublicUrl` fra riktig bøtte, eller signert URL for documents-bøtten)

*Edit-mode (linje 296-373):*
- Vis eksisterende vedlegg med mulighet for å fjerne (sett `fil_url = null`, slett fra storage)
- Mulighet for å erstatte med ny fil eller dokument

*Delete (linje 237-262):*
- Slett fil fra storage når kompetanse slettes (hvis `fil_url` starter med company-path i logbook-images)

**`AddCompetencyDialog.tsx`**
- Samme fil-input + dokument-velger
- Etter insert: last opp fil, oppdater rad

### Competency-interface oppdateres

Legg til `fil_url?: string | null` i `Competency`-interfacet.

### Filer som endres

1. `supabase/migrations/` — ny migrasjon for `fil_url`
2. `src/components/resources/PersonCompetencyDialog.tsx` — fil-opplasting, dokument-velger, visning, sletting
3. `src/components/resources/AddCompetencyDialog.tsx` — fil-opplasting og dokument-velger i add-form

