

## Plan: Synlighet for avdelinger — Nyheter og Dokumenter

### Hva skal bygges
Moderselskap (selskaper med underavdelinger) skal kunne velge å dele nyheter og dokumenter nedover i hierarkiet til alle sine avdelinger/underselskaper.

### Database-endringer

**1. Ny kolonne på `news`-tabellen:**
```sql
ALTER TABLE public.news ADD COLUMN visible_to_children boolean DEFAULT false;
```

**2. Ny kolonne på `documents`-tabellen:**
```sql
ALTER TABLE public.documents ADD COLUMN visible_to_children boolean DEFAULT false;
```

**3. Oppdater RLS-policyer:**

For `news` SELECT: Utvid eksisterende policy slik at avdelinger også ser nyheter fra morselskapet der `visible_to_children = true`:
```sql
-- Brukere ser nyheter fra eget selskap ELLER fra morselskapet hvis visible_to_children
CREATE POLICY "Users can view news from own company" ON news FOR SELECT USING (
  company_id = ANY(get_user_visible_company_ids(auth.uid()))
  OR (
    visible_to_children = true 
    AND company_id = get_parent_company_id(
      (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  )
);
```

For `documents` SELECT: Tilsvarende utvidelse, i tillegg til eksisterende `global_visibility`-logikk.

### UI-endringer

**4. AddNewsDialog.tsx:**
- Sjekk om brukerens selskap er et moderselskap (har underavdelinger) ved å spørre `companies` med `parent_company_id = companyId`
- Hvis ja: Vis en checkbox/switch "Synlig for alle avdelinger"
- Lagre som `visible_to_children: true` på insert/update

**5. DocumentUploadDialog.tsx:**
- Samme logikk: Sjekk om selskapet har underavdelinger
- Vis "Synlig for alle avdelinger"-switch (i tillegg til eksisterende superadmin "Synlig for alle selskaper"-switch)
- Lagre som `visible_to_children: true`

**6. NewsSection.tsx / DocumentSection.tsx:**
- Avdelinger som henter nyheter/dokumenter vil automatisk se morselskap-delte elementer via oppdatert RLS
- Vis et lite badge (f.eks. Building2-ikon) på elementer som kommer fra morselskapet, slik det allerede gjøres for avdelingsdata andre steder

### Teknisk detalj: Sjekke om selskap er moderselskap
Gjenbruke et enkelt query i dialogen:
```typescript
const { data: children } = await supabase
  .from('companies')
  .select('id')
  .eq('parent_company_id', companyId)
  .limit(1);
const isParentCompany = (children?.length ?? 0) > 0;
```

### Filer som endres
- **Migration** (ny): Legg til kolonner + oppdater RLS
- `src/components/dashboard/AddNewsDialog.tsx` — checkbox for visible_to_children
- `src/components/documents/DocumentUploadDialog.tsx` — switch for visible_to_children
- `src/components/dashboard/NewsSection.tsx` — badge for delte nyheter fra morselskap
- `src/components/dashboard/DocumentSection.tsx` — badge for delte dokumenter fra morselskap

