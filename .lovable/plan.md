

## Plan: Avviksrapport-statistikk på /status

### Mål
Legg til en topp-knapp på `/status` som veksler mellom to statistikk-vyer:
1. **Operativ statistikk** (eksisterende innhold — uendret)
2. **Avviksrapporter** (ny vy basert på `mission_deviation_reports`)

### Toggle UI
Øverst i `Status.tsx` (ved siden av tidsperiodevelgeren) legges en `Tabs`/`ToggleGroup` med to alternativer: "Operativt" og "Avviksrapporter". Default = Operativt. Eksisterende periodevelger og eksport gjelder for begge vyer.

### Avviksrapport-vy — innhold

Henter `mission_deviation_reports` filtrert på `created_at` innen valgt periode + selskapets synlige `company_id`-er (via `get_user_visible_company_ids`). Bruker `category_path` (text[]) direkte — reflekterer dermed automatisk hva selskapet har konfigurert.

**KPI-rad (4 kort):**
- Totalt antall avvik i perioden
- Antall unike flyturer med avvik
- Antall unike piloter som har rapportert
- Snitt avvik per flytur (avvik / flightlogger i perioden)

**Graf 1 — Avvik per måned** (BarChart, samme stil som `incidentsByMonth`).

**Graf 2 — Topp-kategorier (rotnivå)** — PieChart eller horisontal BarChart som grupperer på `category_path[0]`. Viser hvilke hovedkategorier som er hyppigst.

**Graf 3 — Underkategori-fordeling med drill-down:**
- Viser BarChart over `category_path[0]`-nivå.
- Klikk på en bar = drill ned, viser fordeling av `category_path[1]` for den valgte rot-kategorien.
- "Tilbake"-knapp + breadcrumb i toppen av kortet.
- Fortsetter rekursivt så lenge det finnes dypere nivåer i dataene.

**Tabell — Detaljer:** Liste under grafene med kolonner: dato · pilotnavn · breadcrumb-sti · kommentar. Sortert nyest først, paginering 20 per side. Klikk på rad åpner tilhørende oppdrag (navigate til `/oppdrag` eller `MissionDetailDialog`).

### Datafetching
Ny funksjon `fetchDeviationStatistics()` kalles parallelt i `fetchAllStatistics()` (men bare når toggle er aktiv eller for å unngå unødig last: kall den lazy ved første visning av fanen og ved periode-/companyId-endring).

```ts
const { data } = await supabase
  .from("mission_deviation_reports")
  .select("id, mission_id, category_path, comment, created_at, reported_by")
  .gte("created_at", startDate.toISOString())
  .lte("created_at", endDate.toISOString());
```
Pilotnavn hentes separat fra `profiles` (samme mønster som vi nettopp innførte i `DeviationReportsSection`).

### Eksport
Excel- og PDF-eksport utvides med ekstra arknavn/seksjon "Avviksrapporter" som inkluderer:
- Avvik per måned
- Topp-kategorier (rotnivå)
- Full liste (dato, pilot, sti, kommentar)

Inkluderes uavhengig av aktiv fane (eksport tar alt).

### Tomtilstand
Hvis selskapet ikke har `deviation_report_enabled` eller ingen rapporter i perioden: vis informasjons-kort med tekst "Ingen avviksrapporter i valgt periode" og lenke til selskapsinnstillinger hvis funksjonen er av.

### Filer som endres
- `src/pages/Status.tsx` — toggle, ny vy-seksjon, ny fetch-funksjon, utvidet eksport

Ingen nye komponenter trengs (alt holder seg innenfor Status-siden for enkelhet og konsistens med eksisterende mønster).

