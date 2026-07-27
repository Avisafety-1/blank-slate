## Mål

Omforme Audit & Compliance fra en "database-visning" til en handlingsorientert compliance-assistent. Fokus: hva må gjøres nå, er vi compliant, hva mangler før tilsyn.

Bygges bak eksisterende Moderavdeling-gate (ingen andre selskaper påvirkes).

---

## 1. Ny Overview (action-first)

Erstatt dagens KPI-rad med "Action Center":

- **Compliance Score-ring** beholdes, men blir klikkbar (ruller til kategorien).
- **Handlingsrettede KPI-kort** erstatter dagens:
  - Dokumenter utløper < 30 dager
  - Kompetanser utløper < 60 dager
  - Droner med service/inspeksjon forfalt
  - Åpne avvik / kritiske funn
  - Planlagte revisjoner
- Hvert kort viser tall + delta ("2 nye siste 7 dager") og lenker direkte til filtrert liste i riktig tab.
- Dagens statistikk-KPI-er (flights 12mo, checklists, risk assessments, active pilots/drones) flyttes til en sammenslått "Aktivitet siste 12 mnd"-mini-strip nederst (kollapset som default) — beholdes for revisorer, men dominerer ikke lenger.
- **CTA "Generer tilsynspakke"** løftes opp som stor knapp i Overview-headeren (fra Inspection Package-tab).

## 2. Compliance Alerts — nivådeling

`ComplianceAlertsPanel` grupperes i tre seksjoner med farge/ikon-header:

- **KRITISK** (rød): expired STS, service overdue, manglende teknisk kontroll, overdue audit actions
- **ADVARSEL** (gul): utløper snart, awaiting verification
- **INFO** (blå): planlagte/kommende revisjoner, anbefalinger

Sortering: severity → deadline → alder. Tell antall pr. nivå i seksjonsheader. Behold reminder-badge og deep-link.

Severity-mapping oppdateres i `validators/*` slik at hver validator eksplisitt setter riktig nivå (i dag flatt).

## 3. Documentation — kategorisering

- Innfør felt `compliance_class` på dokument-domenet (frontend-utledet fra category/tags for å unngå schema-migrasjon i første omgang; DB-kolonne kan legges på senere).
- Filtertabs i DocumentationTab: **Compliance** (default) | Operational | Mission | Other.
- Innfør `compliance_relevance`: Required / Recommended / Optional. Kun `Required` teller i score. Vises som liten badge på kortet.
- Screenshots og løse vedlegg klassifiseres som Other automatisk (basert på filtype/mangler kategori).
- Tomt-state per fane med lenke til Documents-modulen.

## 4. Competency — presise statuser

Utvid `CheckResult` med semantiske subtyper for competency:

- `valid`, `expiring`, `expired`, `not_reviewed`, `no_expiry`, `not_required`

Kun `expired` teller som fail i score; `expiring` = warn; `no_expiry`/`not_required` teller som pass; `not_reviewed` er info (ikke unknown). Oppdater `statusMapping.ts` + i18n-nøkler i no/en.

## 5. Fleet — compliance-fokusert visning

- Standardkolonner: Drone, Service, Neste inspeksjon, Remote ID, Status.
- Firmware, batteri, kalibrering flyttes til utvidbar detaljrad ("Vis detaljer").
- Score i `ComplianceEngine` beregnes kun på de tre compliance-kritiske sjekkene som default; øvrige som "informational" (kan flagges av admin senere).

## 6. Operations — mangel-liste

OperationsTab bygges om til å vise kun avvik:

- Oppdrag uten risikovurdering
- Flyginger ikke lukket
- Manglende flight logs
- Manglende godkjenning

Grupperes pr. type med telling. "Totalt X oppdrag evaluert" som liten fotnote. Rader deep-linker til oppdragskort.

## 7. Safety — top findings

Behold trendgraf, men flytt den under en ny **"Vanligste funn siste 90 dager"**-liste (aggregert fra scanner-funn + audit_findings). Format: `<type> (antall)` med severity-farge, klikk filtrerer detaljer.

## 8. Internal Audits — utvidet oversikt

Utvid tabellen i `InternalAuditsTab` med kolonner: **Neste revisjon | Frist | Ansvarlig | Status | Åpne funn**. Sortering på frist. Rad-klikk åpner eksisterende `AuditDetailDialog`. Legg til "Ny revisjon"-knapp øverst (bruker eksisterende `useCreateAuditReview`).

## 9. Inspection Package

- Beholdes som egen tab, men CTA løftes til Overview (se punkt 1).
- Legg til pre-flight sjekkliste: "3 kritiske funn åpne — anbefaler å lukke før pakken genereres" (advarsel, ikke blokkering).

## 10. Fjerne "Unknown"

Gjennomgå alle validators og status-mappings. Erstatt `unknown` med presis tilstand:
- `not_configured` (mangler oppsett)
- `not_required` (ikke aktuelt for selskapet)
- `not_reviewed` (aldri sjekket)
- `no_expiry` (varig gyldig)
- `pending` (venter på verifisering)

Utvid `CheckResult`-typen; oppdater `statusMapping.ts`, `StatusPill`, i18n. `unknown` beholdes kun som teknisk fallback ved feil.

## 11. Handlings-KPI-kort

`KpiCard` får valgfri `actionHint`-prop (f.eks. "2 krever vedlikehold"). Overview bytter fra rene tall til `<tall> + <handlingslinje>` for hver relevant KPI.

## 12. Compliance Score per kategori

- `ComplianceScoreRing` gjenbrukes i mindre variant.
- Ny komponent `CategoryScoreGrid` viser 5 ringer (Personnel, Documentation, Fleet, Operations, Safety) med prosent + antall åpne funn.
- Klikk på kategori scroller til/åpner tilhørende tab og filtrerer på de funnene som trekker scoren ned.
- Score-beregning finnes allerede pr. kategori i `ComplianceEngine.evaluateCompliance` — kun UI-arbeid.

---

## Rekkefølge (leveres i én PR, gruppert commits)

1. Type-utvidelser (`CheckResult` + `compliance_class`) + i18n-nøkler
2. Validator-oppdatering (severity + presise statuser, fjerne `unknown`)
3. `ComplianceEngine`: bare Required-dokumenter og de tre compliance-fleet-sjekkene teller
4. Overview: Action Center + CategoryScoreGrid + CTA
5. Alerts-panel: nivådeling
6. Tab-refaktor: Documentation (tabs), Fleet (kollapset detalj), Operations (kun avvik), Safety (top findings), Internal Audits (utvidet tabell)
7. QA på Moderavdeling-konto

## Tekniske detaljer

- Ingen DB-migrasjoner nødvendig i første runde. `compliance_class`/`compliance_relevance` utledes frontend fra eksisterende `documents.category`/tags. DB-kolonner vurderes i oppfølging.
- All ny UI bak `companyName === "moderavdeling"`-gate som i dag.
- Alle nye strenger legges i **både** `no.json` og `en.json` under `audit.*`.
- Reminder-status og deep-links (allerede implementert) beholdes uendret.
- Realtime-abonnement på `audit_findings`/`audit_actions` legges til i `useAuditOverview` for at Action Center oppdateres live.

## Ute av scope (kan tas i oppfølging)

- Auto-generert compliance-klassifisering via AI
- Egen DB-tabell for `compliance_documents` med Required/Recommended-flagg
- Skedulerte e-post-rapporter til compliance-ansvarlig
- Utrulling til andre selskaper enn Moderavdeling