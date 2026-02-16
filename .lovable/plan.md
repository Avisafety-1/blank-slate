

## Bildeopplasting for hendelsesrapporter

### Oversikt
Legge til mulighet for a laste opp og vise bilder pa hendelsesrapporter, bade ved opprettelse og redigering.

### Steg

1. **Database-migrasjon**
   - Legge til en `bilde_url` (TEXT, nullable) kolonne pa `incidents`-tabellen

2. **Storage-bucket**
   - Opprette en `incident-images` storage bucket (public) med RLS-policyer:
     - SELECT: Alle autentiserte brukere kan se bilder fra eget selskap
     - INSERT: Godkjente brukere kan laste opp bilder i sin selskapskatalog
     - UPDATE/DELETE: Brukere kan slette/overskrive egne opplastinger

3. **AddIncidentDialog.tsx - Opplasting ved opprettelse og redigering**
   - Legge til state for valgt bildefil og forhåndsvisning (preview URL)
   - Legge til file input med aksept for bildeformater (image/*)
   - Vise forhåndsvisning av valgt bilde i dialogen
   - Ved redigering: forhåndsutfylle med eksisterende `bilde_url` fra hendelsen
   - I `handleSubmit`: laste opp bildet til `incident-images/{company_id}/{timestamp}-{filnavn}`, og lagre URL-en i `bilde_url`-kolonnen
   - Knapp for a fjerne valgt/eksisterende bilde

4. **IncidentDetailDialog.tsx - Visning av bilde**
   - Hvis `incident.bilde_url` finnes, vise bildet i detalj-visningen
   - Vise bildet med passende storrelse og mulighet for a klikke for a se i full storrelse

5. **Supabase types**
   - Regenereres automatisk etter migrasjonen

### Tekniske detaljer

**Migrasjon (SQL):**
```sql
ALTER TABLE incidents ADD COLUMN bilde_url TEXT;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('incident-images', 'incident-images', true);

CREATE POLICY "Users can view incident images from own company"
ON storage.objects FOR SELECT USING (
  bucket_id = 'incident-images' AND
  (storage.foldername(name))[1] = (SELECT company_id::text FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Approved users can upload incident images"
ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'incident-images' AND
  (storage.foldername(name))[1] = (SELECT company_id::text FROM profiles WHERE id = auth.uid()) AND
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND approved = true)
);

CREATE POLICY "Users can delete own incident images"
ON storage.objects FOR DELETE USING (
  bucket_id = 'incident-images' AND
  (storage.foldername(name))[1] = (SELECT company_id::text FROM profiles WHERE id = auth.uid())
);
```

**Filsti-format:** `{company_id}/{timestamp}-{original_filnavn}`

**AddIncidentDialog.tsx endringer:**
- Ny state: `selectedFile`, `previewUrl`
- File input felt med `accept="image/*"`
- Forhåndsvisning med `<img>` og fjern-knapp
- Upload-logikk i `handleSubmit` for supabase.storage.from('incident-images')
- Ved redigering: vise eksisterende bilde fra `incidentToEdit.bilde_url`

**IncidentDetailDialog.tsx endringer:**
- Vise bilde hvis `incident.bilde_url` finnes, med en `<img>`-tag i detalj-seksjonen

### Filer som endres
- Ny migrasjonsfil (SQL)
- `src/components/dashboard/AddIncidentDialog.tsx`
- `src/components/dashboard/IncidentDetailDialog.tsx`
