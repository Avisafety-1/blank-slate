

## Plan: SORA-innstillinger arves fra morselskap til avdelinger

### Problem
Både admin-UI og AI-risikovurdering henter SORA-konfig kun for brukerens aktive `company_id`. Avdelinger som ikke har egne innstillinger ser bare standardverdier — de arver ingenting fra morselskapet.

### Løsning
Legg til fallback-logikk: hvis en avdeling ikke har egen `company_sora_config`-rad, hent morselskapets konfig i stedet.

### Steg 1: Admin-UI — vis arvede innstillinger i avdelinger
**Fil: `src/components/admin/CompanySoraConfigSection.tsx`**

- I `fetchConfig`: hvis ingen rad finnes for `companyId`, sjekk om selskapet har `parent_company_id` (via `companies`-tabellen), og hent morselskapets konfig som fallback.
- Vis en info-banner øverst: «Disse innstillingene er arvet fra [Morselskap]. Endringer her gjelder kun denne avdelingen.»
- Alle felt er redigerbare — avdelingen kan overstyre med egne verdier (som da lagres som egen rad).
- Legg til en «Tilbakestill til morselskap»-knapp som sletter avdelingens egen rad (slik at den igjen arver).

### Steg 2: AI-risikovurdering — fallback til morselskap
**Fil: `supabase/functions/ai-risk-assessment/index.ts`**

- Etter linje 602: hvis `soraConfigData` er null, hent `parent_company_id` fra `companies`, og gjør nytt oppslag mot `company_sora_config` med morselskapets ID.
- Dokumenter (linked_document_ids) hentes også fra morselskapets konfig i fallback-scenariet.

### Steg 3: Dokumenter — vis morselskapets dokumenter i avdeling
**Fil: `src/components/admin/CompanySoraConfigSection.tsx`**

- I `fetchDocuments`: hent også dokumenter fra morselskapet (der `visible_to_children = true`) slik at avdelingsadministratorer kan se hvilke dokumenter som er lenket.

### Filer som endres
- `src/components/admin/CompanySoraConfigSection.tsx` — fallback-logikk + arve-indikator i UI
- `supabase/functions/ai-risk-assessment/index.ts` — fallback til parent config

