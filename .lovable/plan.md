

## Mapper i /dokumenter

### Hva bygges
Administratorer kan opprette mapper som vises som kvadratiske bokser med mappe-ikon øverst på dokumentsiden. Man kan klikke på en mappe for å se innholdet, og inne i mappen kan man legge til eksisterende dokumenter fra systemet.

### Database-endringer

**Ny tabell: `document_folders`**
```sql
create table public.document_folders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade not null,
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);
alter table public.document_folders enable row level security;
```

**Ny koblingstabell: `document_folder_items`**
```sql
create table public.document_folder_items (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references public.document_folders(id) on delete cascade not null,
  document_id uuid references public.documents(id) on delete cascade not null,
  added_at timestamptz default now(),
  unique(folder_id, document_id)
);
alter table public.document_folder_items enable row level security;
```

RLS-policyer bruker `get_user_visible_company_ids()` for lesing og admin-sjekk for skriving, samme mønster som documents-tabellen.

### Frontend-endringer

**1. Ny komponent: `src/components/documents/FolderGrid.tsx`**
- Viser mapper som kvadratiske kort med `FolderOpen`-ikon og mappenavn
- Admin ser en "+" kort for å opprette ny mappe
- Klikk på mappe åpner `FolderDetailDialog`

**2. Ny komponent: `src/components/documents/CreateFolderDialog.tsx`**
- Enkel dialog med tekstfelt for mappenavn
- Lagrer til `document_folders`

**3. Ny komponent: `src/components/documents/FolderDetailDialog.tsx`**
- Viser dokumenter i mappen som en liste
- Admin kan legge til dokumenter via en picker (gjenbruk av eksisterende `AttachmentPickerDialog`-mønsteret med checkbox-liste over dokumenter)
- Admin kan fjerne dokumenter fra mappen
- Admin kan slette/redigere mappen

**4. Oppdater `src/pages/Documents.tsx`**
- Legg til `FolderGrid` mellom filter-baren og dokumentlisten
- Hent mapper med `useQuery` fra `document_folders` + `document_folder_items`

### Visuell struktur
```text
┌──────────────────────────────────────────┐
│  Dokumenter                    [+ Ny] [+]│
├──────────────────────────────────────────┤
│  [Søk...]  [Sortering v]                 │
│  [Regelverk] [Prosedyrer] [Sjekklister]  │
├──────────────────────────────────────────┤
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐     │
│  │ 📁  │  │ 📁  │  │ 📁  │  │  +  │     │
│  │Mappe│  │Mappe│  │Mappe│  │ Ny  │     │
│  └─────┘  └─────┘  └─────┘  └─────┘     │
├──────────────────────────────────────────┤
│  [Dokumenttabell som i dag]              │
└──────────────────────────────────────────┘
```

### Filer som endres/opprettes
1. **Database-migrasjon** — to nye tabeller + RLS
2. **`src/components/documents/FolderGrid.tsx`** — mappeoversikt med kort
3. **`src/components/documents/CreateFolderDialog.tsx`** — opprett mappe
4. **`src/components/documents/FolderDetailDialog.tsx`** — mappeinnhold + legg til/fjern dokumenter
5. **`src/pages/Documents.tsx`** — integrer FolderGrid

