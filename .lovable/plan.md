

## Ny side: `/changelog` — Driftstatus og endringslogg

### Oversikt
En offentlig (for innloggede brukere) side som viser:
1. **Driftsstatus-bar** øverst med integrasjonsstatus (SafeSky, DJI, Dronetag, Kartlag, ECCAIRS, m.fl.)
2. **"Drift og vedlikehold"-banner** med spinne-ikon når vedlikehold pågår
3. **Changelog-liste** med oppgaver/endringer, sortert nyeste først
4. Superadmin kan opprette, redigere og slette alt. Andre brukere ser kun.

### Database

**Tabell: `changelog_systems`** — integrasjonsstatus
```sql
create table public.changelog_systems (
  id uuid primary key default gen_random_uuid(),
  name text not null,               -- "SafeSky", "DJI", etc.
  status text not null default 'green', -- 'green' | 'yellow' | 'red'
  description text,                 -- Valgfri forklaring
  sort_order int not null default 0,
  updated_at timestamptz default now()
);
```

**Tabell: `changelog_entries`** — endringslogg
```sql
create table public.changelog_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'ikke_startet', 
    -- 'ikke_startet' | 'pågår' | 'testing' | 'implementert'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

**Tabell: `changelog_maintenance`** — vedlikeholdsmelding
```sql
create table public.changelog_maintenance (
  id uuid primary key default gen_random_uuid(),
  active boolean not null default false,
  message text not null default 'Drift og vedlikehold pågår',
  updated_at timestamptz default now()
);
```

**RLS**: Alle tabeller — SELECT for alle authenticated, INSERT/UPDATE/DELETE kun via `has_role(auth.uid(), 'superadmin')`.

Forhåndspopulere `changelog_systems` med: SafeSky, DJI Cloud, Dronetag, Kartlag, ECCAIRS, E-post.

### Frontend

**`src/pages/Changelog.tsx`** — Ny side:
- Bruker `useAuth()` for `isSuperAdmin`
- Henter data fra de tre tabellene via Supabase client
- **Topp**: Vedlikeholdsbanner (hvis aktiv) med `Loader2` spinne-ikon
- **Statusbar**: Rad med kort, hvert system viser navn + farget sirkel (grønn/gul/rød). Superadmin kan klikke for å endre status og legge til beskrivelse
- **Changelog-liste**: Kort/rader med tittel, beskrivelse, dato, statusbadge. Superadmin ser "Legg til", "Rediger", "Slett"-knapper
- Statusbadges: Ikke startet (grå), Pågår (gul), Testing (blå), Implementert (grønn)

**Ruting** (`App.tsx`):
- Legg til `/changelog` som public-ish route (innenfor `AuthenticatedLayout`)
- Import `Changelog` page

**Header** (`Header.tsx`):
- Legg til navigasjonslenke til `/changelog`

### Superadmin-redigering
Inline redigering via dialoger (Dialog-komponenter som allerede brukes i prosjektet):
- **SystemStatusDialog**: Endre status + beskrivelse per system, legge til/fjerne systemer
- **ChangelogEntryDialog**: Opprett/rediger oppgave med tittel, beskrivelse, status
- **MaintenanceToggle**: Switch for å aktivere/deaktivere vedlikeholdsbanner + melding

