## Mål
Gjøre listen over oppdragstyper redigerbar per selskap, og bruke samme liste både i:
- Skjemaet "Legg til/rediger oppdrag" (felt `oppdragstype`)
- AI risikovurdering (felt "Operasjonstype")

I dag er begge listene hardkodet (i `AddMissionDialog.tsx` linje 1276–1284 og `RiskAssessmentDialog.tsx` linje 685–691), og de er ikke engang like.

## Løsning i hovedtrekk

1. **Ny tabell `company_mission_types`** i Supabase.
   - Felter: `company_id`, `label`, `sort_order`, `is_active`.
   - RLS: SELECT for medlemmer av selskapet og for datterselskaper (via `get_user_visible_company_ids()`); INSERT/UPDATE/DELETE kun admin i eierselskapet.
   - **Seeding**: engangs-migrasjon legger til dagens fulle hardkodede liste for alle eksisterende selskaper:
     - Fra oppdragsskjema: Inspeksjon, Kartlegging, Foto/film, Søk og redning, Landbruk, Bygg/anlegg, Forskning.
     - Fra AI risikovurdering i tillegg: Filming, Levering.
     - "Annet" er en fast spesialverdi i UI og lagres ikke i tabellen.
   - Trigger på `INSERT` i `companies` seeder ny selskap med samme standardliste.

2. **Parent-arv ("Gjelder for alle avdelinger")**
   - Nytt felt på `companies`: `propagate_mission_types boolean default false`.
   - Når moderselskap slår dette PÅ:
     - Datteravdelinger leser fra moderselskapets liste i stedet for sin egen (mønster lik `propagate_currency_requirement` i `useCompanySettings.ts`).
     - Datteravdelinger får read-only visning av listen i sin egen admin-UI med tydelig banner "Styres av {moderselskap}".
   - Når PÅ vises også en knapp/checkbox i mor-UI: "Gjelder for alle avdelinger" → setter `propagate_mission_types=true`.
   - Når AV: hver datteravdeling bruker sin egen liste som før.
   - Lesehook returnerer alltid effektiv liste (mor sin hvis propagering, ellers egen).

3. **Ny hook `useCompanyMissionTypes()`**
   - Henter effektiv liste (med parent-arv-logikk).
   - Returnerer `{ types: string[], isInherited: boolean, source: 'own'|'parent' }`.
   - Fallback til hardkodet standardliste hvis tabellen er tom (sikrer at eksisterende selskaper aldri får tom dropdown før migrasjonen kjører).

4. **Admin-UI: ny seksjon "Oppdragstyper"** i selskapsinnstillinger (samme sted som øvrige selskapsinnstillinger). Admin kan:
   - Legge til, redigere navn, endre rekkefølge (drag eller pilknapper), deaktivere/slette.
   - I moderselskap: toggle "Gjelder for alle avdelinger".
   - I datterselskap når propagering er på: read-only liste + banner.
   - "Annet" vises som fast pseudo-rad nederst (kan ikke fjernes).

5. **Bruk i skjemaer**
   - `AddMissionDialog.tsx`: hardkodet `<SelectItem>`-liste byttes ut med `.map()` over hookens `types`. "Annet" og "Ikke spesifisert" beholdes som faste items.
   - `RiskAssessmentDialog.tsx`: hardkodet liste byttes ut tilsvarende. Lagret verdi blir samme label som i oppdrag (norsk tekst, f.eks. "Inspeksjon") i stedet for dagens enum (`inspection`, `mapping`, …). AI-prompten oppdateres til å ta imot fritekst-operasjonstype.
   - Eksisterende lagrede enum-verdier i risikovurderinger forblir kompatible (vises som-is, vi mapper kun ved nye lagringer).

## Tekniske detaljer

**Tabell**
```sql
create table public.company_mission_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, label)
);
alter table public.companies add column propagate_mission_types boolean not null default false;
```
Med GRANT til authenticated + service_role, RLS som beskrevet, seed-migrasjon for eksisterende selskaper, og trigger for nye.

**Filer som endres**
- Migrasjon: ny tabell, nytt selskapsfelt, seed + insert-trigger.
- Ny: `src/hooks/useCompanyMissionTypes.ts`
- Ny: `src/components/admin/MissionTypesSection.tsx`
- Endring: admin-side for selskapsinnstillinger — legge inn `<MissionTypesSection />`.
- Endring: `src/hooks/useCompanySettings.ts` — inkluder `propagate_mission_types`.
- Endring: `src/components/dashboard/AddMissionDialog.tsx` (linje 1275–1285).
- Endring: `src/components/dashboard/RiskAssessmentDialog.tsx` (linje 685–691) + `pilotInputs.operationType` default.
- Mulig endring: `supabase/functions/ai-risk-assessment` for å akseptere fritekst-operasjonstype.

## Verifisering
- Admin oppretter ny type "Linjebefaring" → vises i både oppdragsskjema og AI risikovurdering.
- Eksisterende oppdrag og risikovurderinger beholder lagrede verdier uendret.
- Moderselskap slår på "Gjelder for alle avdelinger" → datteravdelinger ser samme liste, read-only banner.
- Moderselskap slår av propagering → datteravdelinger får tilbake egen liste.
- Sletting av en type fjerner den fra dropdown, men ødelegger ikke historikk.
