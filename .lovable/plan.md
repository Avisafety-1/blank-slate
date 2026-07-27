## Mål

Gjøre Audit & Compliance til en fokusert, handlingsorientert modul der data faktisk speiler databasen, tabbene grupperer intelligent, alt er i18n-dekket, og "Internal audits" + "Inspection package" blir reelle arbeidsverktøy — ikke bare et speil av alt som finnes i systemet.

## Problemer i dagens versjon (verifisert)

- **KPI-klikk scroller feil**: `scrollToAuditTab` i `OverviewTab.tsx` leter etter `[value="…"]` på Radix TabsTrigger — Radix legger ikke `value` som DOM-attribute, så treffen faller alltid tilbake til første fane og siden scroller bare oppover.
- **Compliance alerts ikke scrollbar**: `ComplianceAlertsPanel` viser `limit=15` og resten forsvinner ("Showing X of Y") uten paginering.
- **Documentation**: klassifiserer alle dokumenter (Compliance/Operational/Mission/Other) — men de fleste får `noExpiry`-status og blir støy. Skal reduseres til dokumenter *med* utløpsdato.
- **Competency**: flat tabell over alle piloter × alle sertifiseringer, ingen filtrering, ingen gruppering per person.
- **Fleet**: tracker `remoteId`, `firmware`, `calibration`, `batteryHealth` som "not_configured" — bråker uten verdi. Vi har `drone_inspections` og `drone_log_entries` som ikke brukes.
- **Operations**: alle avvik listes flatt, mange kort på siden.
- **Safety**: `nearMiss` er avledet av regex på `kategori` (`/neste/i`) — upålitelig. Trend-grafen er lite nyttig.
- **Internal audits**: bruker fortsatt `mockInternalAudits` i state — `useCreateAuditReview` finnes men er ikke koblet til. Ingen avdelingsvelger. Sjekklistene er hardkodet norsk.
- **Inspection package**: bare en "coming soon" toast + hardkodet liste.
- **i18n-hull**: `audit.status.noExpiry`, `audit.status.valid`, `audit.status.expired` vises som råe nøkler i skjermbildene (mangler i `no.json`/`en.json`); `AuditDetailDialog` er 100 % norsk hardkodet.

## Forslag til ny struktur

### 1. Overview
- Fiks KPI-scrolling: bruk `Tabs` sin `onValueChange` via en delt state (løft `activeTab` fra `AuditSection` og pass ned setter) i stedet for `document.querySelector`-hack.
- Handlings-KPI-kortene beholdes, men tallene skal matche det som faktisk vises i tabbene (samme spørring).
- **ComplianceAlertsPanel**: bytt `limit=15`-hard-cut til en scrollbar liste (`max-h-[520px] overflow-y-auto`) + "Vis flere"-knapp per alvorlighetsgruppe. Fjern "Showing X of Y".

### 2. Documentation — kun det som betyr noe
- Fjern klassefanene (Compliance/Operational/Mission/Other). Erstatt med tre statustabs: **Utløpt** (rød), **Utløper snart** (gul, ≤ 60d), **Gyldig** (grønn). Skjul dokumenter helt uten `gyldig_til` bak en "Vis dokumenter uten utløp"-lenke — telles ikke som compliance-svikt.
- Kortvisning erstattes med tett tabell: `Dokument | Kategori | Ansvarlig | Utløper | Status | [Åpne]`.

### 3. Competency — person først
- Grupper `personnel_competencies` per `profileId`. Én rad per pilot med worst-case badge (utløpt/utløper/gyldig) og antall avvik.
- Klikk på pilot ekspanderer inline rad med hver sertifisering + `Valid until` + `[Åpne person]` (deep-link til `/resources?tab=personnel&id=…`).
- Sortering: piloter med utløpte først, deretter utløper snart, deretter gyldig.
- Filter-input: søk på navn.

### 4. Fleet — compliance-kritisk kun
- Behold kolonner: `Drone | Registrering | Neste inspeksjon | Status | Åpne loggavvik`.
- Fjern `remoteId`, `firmware`, `calibration`, `batteryHealth` helt (også fra `FleetRow`-typen og fra `ComplianceEngine`).
- Legg til `Åpne loggavvik`-tall: `drone_log_entries` hvor `entry_type in ('deviation','issue','fault')` og ikke lukket. Ekspander for detaljer med lenke til `/resources?tab=drones&id=…`.
- Legg til `drone_inspections`-siste inspeksjonsdato + `passed`-flagg som informasjonskolonne.

### 5. Operations — ekspanderbar
- Én `Accordion` med én seksjon per issue-type: `Flight not closed | Missing risk assessment | Missing checklist | Missing approval`. Kollapset som default, count-badge i header, seksjoner med 0 vises ikke.

### 6. Safety — nye KPI-er
- Fjern `nearMiss` (upålitelig regex). Erstatt KPI-rad med: **Reported 12mo**, **Åpne hendelser**, **Kritiske hendelser**, **Gjennomsnitt lukketid**, **% lukket innen frist**.
- Kompletter med to fordelinger:
  - **Alvorlighetsgrad** (donut/stacked bar fra `incidents.alvorlighetsgrad`).
  - **Kategori** (top 5 fra `incidents.kategori`).
- Trend-graf: bytt "reported vs near-miss" til stacked bar per måned per alvorlighetsgrad.

### 7. Internal audits — reell CRUD
- Rive ut `mockInternalAudits`. Bruk `useAuditReviews` + `useCreateAuditReview`/`useUpdateAuditReview`/`useCreateAuditFinding` (finnes allerede).
- **+ New audit**-knapp åpner dialog med:
  - Tittel, dato, ansvarlig (dropdown fra `profiles` i selskapet)
  - **Avdeling** (dropdown fra `get_user_visible_company_ids` → `companies.navn`) → lagres på `audit_reviews.scope = { company_id: <valgt> }`.
  - **Auto-populert sjekkliste**: hver seksjon (organization/documentation/competency/operations/technical/safety) forhåndsutfylles med systemdata:
    - Documentation: pull utløpte dokumenter for valgt avdeling → forhåndslagd som ubekreftet linje "Dokument X utløper Y — bekreft?"
    - Competency: piloter med utløpt kompetanse
    - Operations: flights not closed, mangler risikovurdering
    - Technical: droner med forfalt inspeksjon
    - Safety: åpne hendelser med kritisk alvorlighet
  - Bruker kan huke av (bekreft), legge kommentar eller konvertere til `audit_finding` med ett klikk.
- Refaktorer `AuditDetailDialog` til å bruke `audit_reviews`/`audit_findings`/`audit_actions`-tabellene (skriving via mutations, ikke lokal state), og oversett all hardkodet norsk (`SECTION_LABELS`, `SECTION_ITEMS`, dialog-knapper).

### 8. Inspection package — konkret innhold
Forslag til hva pakken faktisk skal bygge (PDF/ZIP eksport):
- **Selskapsinfo**: firma, org.nr, adresse, kontaktperson (fra `companies`).
- **Personellregister**: piloter + gyldige sertifiseringer per pilot (fra `profiles`+`personnel_competencies`).
- **Droneregister**: aktive droner, registreringsnummer, siste inspeksjon, neste inspeksjon (fra `drones`+`drone_inspections`).
- **Operasjonsmanual + policyer**: dokumenter der `complianceRelevance = required` (lenker til storage).
- **Siste 12 mnd flygetimer og oppdrag** (fra `flight_logs`+`missions`).
- **Åpne funn og pågående tiltak** (fra `audit_findings`+`audit_actions`).
- **Hendelseslogg 12 mnd** (fra `incidents`).
- **Siste 3 gjennomførte internrevisjoner** (fra `audit_reviews` closed).
- **Compliance-score-snapshot** (fra engine).

MVP i denne runden: bygg opp *innholdsfortegnelsen* som en real preview som viser telleverdier per seksjon, og lås `Generate`-knappen bak `criticalFindings === 0`. Selve PDF-genereringen kan vente på en egen runde.

### 9. i18n
- Legg til manglende nøkler i `no.json` + `en.json`: `audit.status.valid/expiring/expired/noExpiry/notReviewed/notRequired/notConfigured/pending`, alle strengene i `AuditDetailDialog`, nye tab-etiketter (Documentation status-tabs, Fleet-kolonne "Åpne loggavvik", Safety severity-KPI-er, Internal-audit dialog).
- Legg til i18n-scan-hook i denne rundens PR-sjekk (kjør `bun run i18n-scan` etterpå).

## Tekniske detaljer

- **Fjern `remoteId/firmware/calibration/batteryHealth`** fra `FleetRow`, `fetchFleet`, `ComplianceEngine.fleet`-scoring og `FleetTab`.
- **Nye queries**:
  - `fetchDroneDeviations(userId, companyId)` — `drone_log_entries` filtrert på deviation-typer.
  - `fetchDroneInspections(userId, companyId)` — siste inspeksjon per drone fra `drone_inspections`.
  - `fetchSafetyBreakdown(userId, companyId)` — utvide `fetchSafety` med `bySeverity`/`byCategory`/`closedOnTime`.
  - `fetchDepartmentSuggestions(reviewCompanyId)` — brukt av New Audit-dialog for å hente forhåndsutfylte punkter.
- **Aktiv tab som state** i `AuditSection`: `const [tab, setTab] = useState('overview')`, gi `setTab` til `OverviewTab` og `CategoryScoreGrid` for direkte navigering (ingen DOM-hacks).
- **ComplianceAlertsPanel**: `max-h-[560px] overflow-y-auto` på `<CardContent>`; behold severity-headere som sticky (`sticky top-0 bg-card`).
- **`AuditDetailDialog`**: erstatte lokal `useState<InternalAudit>` med `useUpdateAuditReview` + `useCreateAuditFinding` mutations. Slette `mockInternalAudits`.
- **Migrasjon nødvendig**: nei — bruker eksisterende tabeller (`audit_reviews.scope` jsonb finnes; `drone_log_entries`, `drone_inspections`, `incidents.alvorlighetsgrad` finnes).

## Rekkefølge på implementering

1. Fiks KPI-scroll + scrollbar alerts (rask, høy verdi).
2. Fjern fleet-støyfeltene + trekk inn `drone_log_entries`/`drone_inspections`.
3. Refaktor Documentation til status-tabs.
4. Refaktor Competency til person-gruppert liste.
5. Konverter Operations til Accordion.
6. Refaktor Safety-KPI-er + severity breakdown.
7. Koble Internal audits til ekte tabeller + avdelingsvelger + forhåndsutfylte forslag + oversett dialog.
8. Bygg Inspection package-preview med telleverdier.
9. Legg til/rydd i18n-nøkler i `no.json` + `en.json`; kjør scan.
10. Manuell verifisering på `/admin` (Moderavdeling).

Ingen brytende DB-endringer, ingen påvirkning for selskaper utenfor allowlisten.