# Aktiver RLS på 2 systemtabeller

## Mål
Lukke de to "RLS Disabled in Public"-funnene fra Advisor uten å påvirke noen brukerfunksjonalitet.

## Tabeller

### 1. `public.spatial_ref_sys`
PostGIS sin innebygde tabell med koordinatsystemer (~8500 rader, kun les). Brukes internt av PostGIS-funksjoner som `ST_Transform`. Inneholder ingen brukerdata.

### 2. `eccairs.value_list_items`
Statisk oppslagsdata (kodeverdier) for ECCAIRS-rapportering. Inneholder ingen brukerdata.

## Endring
Aktiver RLS + legg til én policy på hver tabell:

- **SELECT**: tillatt for `authenticated` (alle innloggede brukere)
- **INSERT/UPDATE/DELETE**: ingen policy → blokkert for vanlige brukere
- Edge functions (service role) bypasser RLS som vanlig → uberørt

## Migrasjons-SQL (oppsummert)
```sql
alter table public.spatial_ref_sys enable row level security;
create policy "Authenticated read spatial_ref_sys"
  on public.spatial_ref_sys for select to authenticated using (true);

alter table eccairs.value_list_items enable row level security;
create policy "Authenticated read value_list_items"
  on eccairs.value_list_items for select to authenticated using (true);
```

## Hvorfor dette er trygt
- Ingen anonyme bruksmønstre i appen leser disse tabellene direkte (alt går via innlogget bruker eller edge functions).
- `spatial_ref_sys` kan i noen tilfeller være eid av `supabase_admin`/`postgres` — `alter table … enable rls` kjøres derfor i en `do $$ … exception` blokk som logger advarsel hvis vi ikke har eierskap, slik at migrasjonen ikke feiler.
- Ingen INSERT/UPDATE/DELETE skjer mot disse fra brukerkode, så manglende write-policy bryter ingenting.

## Verifisering etter migrasjon
1. Åpne kart i `/oppdrag` (verifiserer at PostGIS-spørringer fortsatt fungerer).
2. Åpne ECCAIRS-rapporteringsdialog (verifiserer at oppslagsdata fortsatt vises).
3. Kjør Supabase linter på nytt — de to "RLS Disabled in Public" skal være borte.
