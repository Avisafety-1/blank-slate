

## Plan: Fiks arv av avviksrapport-kategorier til avdelinger

### Diagnose
Avdelinger ser «Ingen kategorier definert» selv om moderavdelingen har 34 kategorier. Årsak: RLS-policyen på `deviation_report_categories` tillater kun lesing av rader der `company_id` er i `get_user_visible_company_ids(auth.uid())`. Den funksjonen returnerer `eget selskap + barn`, men **ikke parent**. Dermed blir parent-kategoriene blokkert for avdelings-admin.

Dette forklarer også hvorfor `DeviationReportDialog` ikke fungerer for avdelinger (samme query, samme RLS-blokkering) — pop-upen kan vises tom eller hoppes over.

### Løsning: SECURITY DEFINER-funksjon for arvet kategorilesing

Lag en server-side funksjon som returnerer kategoriene fra effective company (parent hvis `propagate_deviation_report = true`, ellers eget selskap), og bruk den fra UI istedenfor direkte SELECT mot tabellen.

**1. Ny database-funksjon `get_effective_deviation_categories(_company_id uuid)`**
- `SECURITY DEFINER`, `STABLE`.
- Slår opp `companies.parent_company_id` og parent's `propagate_deviation_report`.
- Hvis avdeling og parent propagerer → returnerer parent's kategorier.
- Ellers → returnerer egne kategorier.
- Returnerer `setof deviation_report_categories` (id, parent_id, label, sort_order, company_id).
- GRANT EXECUTE til `authenticated`.

Adgangssjekk i funksjonen: kun la brukeren kalle den hvis `_company_id IN get_user_visible_company_ids(auth.uid())` (slik at den ikke kan brukes til å lekke vilkårlige selskaper).

**2. Bruk funksjonen tre steder:**
- `DeviationCategoryTreeEditor.tsx` (linje 71-74): Når `readOnly=true`, kall `supabase.rpc('get_effective_deviation_categories', { _company_id })` istedenfor direkte SELECT. (Editoren får ellers samme adgang som før i edit-modus.)
- `DeviationReportDialog.tsx` (linje 61-64): Bytt til RPC for å hente kategoriene som vises i pop-upen for piloten.
- `LogFlightTimeDialog.tsx` (linje 902-906): Bytt count-spørringen til RPC + `.length > 0`-sjekk (eller en egen `has_effective_deviation_categories(_company_id)`-funksjon for raskere telling).

**3. Liten justering i `ChildCompaniesSection.tsx`**
Send `companyId` (avdelingens egen id) — ikke `parentDeviationCompanyId` — inn til editoren i låst modus. Editoren bruker RPC og finner selv riktig kilde basert på propagate-flagget. Dette gir også korrekt fallback hvis parent senere skrur av propagering.

### Filer som endres
- Migrasjon: ny funksjon `get_effective_deviation_categories` (+ ev. `has_effective_deviation_categories`).
- `src/components/admin/DeviationCategoryTreeEditor.tsx` (RPC i readOnly-modus).
- `src/components/DeviationReportDialog.tsx` (RPC for kategorier).
- `src/components/LogFlightTimeDialog.tsx` (RPC for sjekk om kategorier finnes).
- `src/components/admin/ChildCompaniesSection.tsx` (send `companyId` til readOnly-editor).

### Resultat
Avdelings-admin ser parent-kategoriene som «arvet — kun lesetilgang». Avviksrapport-pop-upen viser de samme kategoriene til piloten i avdelingen og kan lagres normalt.

