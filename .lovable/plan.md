

## Tilknytt dokumenter til droner

### Oversikt

Ny kobling mellom droner og dokumenter via en `drone_documents` join-tabell. Brukeren kan knytte bruksanvisning, datablad etc. til en drone via `AttachmentPickerDialog` (allerede eksisterende). Dokumentene vises som en ny seksjon i `DroneDetailDialog`, med samme mønster som tilknyttet utstyr/personell.

### Database

Ny migrasjon:

```sql
CREATE TABLE public.drone_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drone_id uuid NOT NULL REFERENCES public.drones(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(drone_id, document_id)
);

ALTER TABLE public.drone_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage drone documents for their company"
  ON public.drone_documents FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
```

### UI-endringer i `DroneDetailDialog.tsx`

1. **Ny state**: `linkedDocuments`, `documentPickerOpen`
2. **Ny fetch-funksjon** `fetchLinkedDocuments`: henter fra `drone_documents` med join til `documents(id, tittel, kategori, fil_url, fil_navn)`
3. **Ny seksjon** i view-modus (etter personell-seksjonen, før valgfritt utstyr):
   - Header med `FileText`-ikon + "Tilknyttede dokumenter"
   - "Legg til"-knapp som åpner `AttachmentPickerDialog`
   - Liste over tilknyttede dokumenter med tittel, kategori, og X-knapp for å fjerne
   - Klikk på dokument åpner fil i ny fane (signert URL for documents-bøtten)
4. **Fjern-funksjon**: sletter rad fra `drone_documents`
5. **AttachmentPickerDialog** gjenbrukes — `onSelect` inserter rader i `drone_documents`

### Filer som endres

1. `supabase/migrations/` — ny migrasjon for `drone_documents`-tabell
2. `src/components/resources/DroneDetailDialog.tsx` — ny dokumentseksjon med picker og visning

