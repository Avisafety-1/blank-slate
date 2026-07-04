## Problem
Nåværende Tensio-gate (både i kartet og i "Standard kartlag"-innstillingen) sjekker kun om selskapets eget navn eller direkte forelder-navn inneholder "tensio". Underavdelinger av Tensio som ikke har "tensio" i navnet — og spesielt avdelinger to nivåer ned — vil dermed ikke se laget. Svaret på brukerens spørsmål er altså: nei, ikke alltid.

## Løsning
Bytt sjekken fra "navn på meg eller direkte parent" til "navn på rot-selskapet i hierarkiet". Rot-selskapet finnes allerede via SQL-funksjonen `public.get_parent_company_id(_company_id)` (returnerer rot for et gitt selskap, eller `null` hvis selskapet selv er rot).

### 1. `src/config/mapLayers.ts`
- Behold `restrictedToCompanyNameContains` og `isLayerAvailableForCompany(entry, rootCompanyName)` — men endre signatur/semantikk til å ta ett enkelt "rot-navn" (kaller kan sende inn selskapets eget navn hvis det er rot).

### 2. Ny hjelper `src/lib/companyHierarchy.ts` (liten)
- `resolveRootCompanyName(companyId): Promise<string | null>`
  - Kaller `supabase.rpc('get_parent_company_id', { _company_id: companyId })`.
  - Hvis RPC returnerer `null` → hent `companies.name` for `companyId`.
  - Ellers → hent `companies.name` for det returnerte rot-id-et.
- Enkel modul-nivå cache (Map<companyId, name>) for å unngå gjentatte kall i samme økt.

### 3. `src/components/admin/MapLayerDefaultsSection.tsx`
- Erstatt uthenting av `parent:companies!parent_company_id(name)` med kall til `resolveRootCompanyName(companyId)`.
- Filtrer `MAP_LAYER_CATALOG` via `isLayerAvailableForCompany(entry, rootCompanyName)`.
- Ingen endring i lagring, propagering eller UI-struktur.

### 4. `src/components/OpenAIPMap.tsx`
- Erstatt `isTensioHierarchy = isTensioName(companyName) || isTensioName(parentCompanyName)` med sjekk mot rot-navn via samme `resolveRootCompanyName(...)`-hjelper (eller inline RPC-kall bak en `useEffect` som setter en `isTensioHierarchy`-state).
- All annen kart-logikk (WMS-lag, pane, popups, propagert `default_map_layers`) er uendret.

## Ingen migrasjon
Bruker eksisterende `get_parent_company_id` og `companies.name`. Ingen skjema-, RLS- eller propageringsendringer.

## Verifisering
- Tensio (rot) → ser laget i admin og i /kart.
- Tensio-underavdeling uten "tensio" i navnet → ser og kan togle laget begge steder (dette var det brutte scenariet).
- Selskap uten Tensio i noen del av hierarkiet → ser aldri laget verken i admin eller på /kart.
