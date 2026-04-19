

## Plan: Avviksrapport ved avsluttet flytur

### Mål
Selskap kan slå på en valgfri "Avviksrapport"-funksjon. Når en flytur avsluttes, får piloten en pop-up: "Ønsker du å rapportere noe fra flyturen?". Ved Ja → hierarkisk valgliste (selskapet konfigurerer kategoriene/underkategoriene selv, vilkårlig dybde) + kommentarfelt. Rapporten lagres på oppdragskortet.

### Database (migrasjoner)

**1. `companies.deviation_report_enabled boolean default false`** — feature toggle.

**2. `deviation_report_categories`** — tre-struktur per selskap:
```
id uuid PK
company_id uuid → companies(id)
parent_id uuid NULL → deviation_report_categories(id) ON DELETE CASCADE
label text
sort_order int
created_at timestamptz
```
Indeks på (company_id, parent_id). RLS: select/insert/update/delete via `get_user_visible_company_ids()` + admin-rolle for skriving.

**3. `mission_deviation_reports`** — selve rapporten:
```
id uuid PK
mission_id uuid → missions(id) ON DELETE CASCADE
flight_log_id uuid NULL → flight_logs(id)
company_id uuid
reported_by uuid → profiles(id)
category_path text[]   -- f.eks. ['Teknisk','Batteri','Spenningsfall']
category_ids uuid[]    -- speilet for sporbarhet
comment text
created_at timestamptz default now()
```
RLS: lese for synlige selskap; insert for innlogget bruker i eget selskap.

### Selskapsinnstillinger UI

I `ChildCompaniesSection.tsx` (under «Mitt selskap») legges en ny ekspanderbar seksjon **"Avviksrapport ved flytur"**:
- Switch: aktiver funksjonen (`deviation_report_enabled`).
- Når aktivert: tre-editor for kategorier.
  - Ny komponent `DeviationCategoryTreeEditor.tsx` — viser nestet liste med +/redigér/slett per node, "Legg til underkategori" på hver node. Ingen dybdebegrensning.
  - Drag-håndtak utelates i v1 — bruk `sort_order` via opp/ned-piler.
- Propageringstoggle "Gjelder for alle underavdelinger" (samme mønster som øvrige settings).

### Pilot-flyt (pop-up etter flytur)

I `LogFlightTimeDialog.tsx`, etter vellykket lagring av flightlog (rett før `onFlightLogged()` kalles):
- Hvis `companyId` har `deviation_report_enabled=true` og minst én rotkategori finnes → åpne ny dialog `DeviationReportDialog`.

Ny komponent `src/components/DeviationReportDialog.tsx`:
1. **Steg 1 — Ja/Nei-prompt:** "Ønsker du å rapportere noe fra flyturen?" → Nei lukker, Ja går til steg 2.
2. **Steg 2 — Hierarkisk valg:** Viser barna til gjeldende node (start = roten). Klikk på et valg = drill ned. Når noden ikke har barn = bladnode. "Tilbake"-knapp + breadcrumb viser valgt sti.
3. **Felles kommentarfelt** (Textarea) synlig hele tiden under listen.
4. **Lagre**-knapp (aktiv så snart minst én kategori er valgt). Kan lagres på en mellomnode hvis brukeren velger «Lagre her» — eller alltid kreve bladnode? → vi lar **Lagre** være tilgjengelig på alle nivåer (fleksibelt).
5. Insert i `mission_deviation_reports` med `category_path`, `category_ids`, `comment`, `mission_id` (fra flightlog), `flight_log_id`.

### Visning på oppdragskortet

I `MissionDetailDialog.tsx` legges en ny seksjon **"Avviksrapporter"** (bare synlig hvis det finnes rapporter):
- Henter `mission_deviation_reports` for `mission.id`.
- Liste-element: dato · pilotnavn · breadcrumb (`Teknisk › Batteri › Spenningsfall`) · kommentar.
- Badge med antall ved fanen/seksjonsoverskrift.

### Filer som opprettes/endres

**Nye:**
- `src/components/admin/DeviationCategoryTreeEditor.tsx`
- `src/components/DeviationReportDialog.tsx`
- migrasjon: `companies.deviation_report_enabled`, `deviation_report_categories`, `mission_deviation_reports` + RLS

**Endres:**
- `src/components/admin/ChildCompaniesSection.tsx` — ny seksjon
- `src/hooks/useCompanySettings.ts` — eksponer `deviation_report_enabled`
- `src/components/LogFlightTimeDialog.tsx` — utløse dialog etter lagring (med mission_id + flight_log_id)
- `src/components/dashboard/MissionDetailDialog.tsx` — vise rapporter

### Edge cases
- Funksjon av: hopp helt over pop-up.
- Ingen kategorier definert: vis informasjons-toast til admin når toggle slås på, og hopp over pop-up for piloter.
- Offline: rapporten legges i `offlineQueue` (samme mønster som flightlog).
- Flytur uten tilknyttet oppdrag: rapporten lagres med `mission_id` til den auto-opprettede "Flytur …"-missionen som allerede genereres i LogFlightTimeDialog.

