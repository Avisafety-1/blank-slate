# Ny admin-fane: Revisjon / Audit

Ren frontend-modul. Ingen DB, edge functions eller migrations. All data fra mock-filer, arkitektur klargjort for senere ekte data.

## Filstruktur

```
src/components/admin/audit/
  AuditSection.tsx              // Container med indre Tabs (8 stk)
  tabs/
    OverviewTab.tsx
    DocumentationTab.tsx
    CompetencyTab.tsx
    FleetTab.tsx
    OperationsTab.tsx
    SafetyTab.tsx
    InternalAuditsTab.tsx       // CRUD med lokal useState
    InspectionPackageTab.tsx
  components/
    KpiCard.tsx                 // Gjenbrukbar KPI-kort (label, value, icon, trend)
    ComplianceScoreRing.tsx     // Sirkulær progress (SVG)
    AuditReadinessList.tsx      // Sjekkliste med ✅/⚠ badges
    AuditFindingDialog.tsx      // Legg til/rediger funn (mock-state)
    AuditDetailDialog.tsx       // Åpne revisjon → seksjoner + funn + tiltak
    PlaceholderCard.tsx         // "Data mangler / kommer" fallback
    AiAuditCard.tsx             // Placeholder-kort nederst på Oversikt
  data/
    mockAuditData.ts            // Alle mock-datasett i én fil, typet
  types.ts                      // AuditFinding, AuditAction, InternalAudit, m.m.
  lib/
    complianceScore.ts          // Ren funksjon (input → score). Kalles i dag med mock, senere med ekte data.
```

## Integrasjon i Admin

I `src/pages/Admin.tsx`:
- Ny `<TabsTrigger value="audit">` med `ShieldCheck`-ikon og label `t('admin.tabs.audit')` (default "Revisjon"). Plasseres etter `training`.
- Ny `<TabsContent value="audit">` som rendrer `<AuditSection />`.
- Kun synlig for admin/superadmin (samme mønster som eksisterende faner via `useRoleCheck().isAdmin`).

## Faner (indre Tabs i AuditSection)

1. **Oversikt** – KPI-grid (Compliance score-ring + 6 KPI-kort) → Audit readiness progress bar + sjekkliste → `AiAuditCard` nederst.
2. **Dokumentasjon** – Grid av dokumentkort (tittel, status-badge, neste revisjon, ansvarlig). Placeholder-hook `getDocuments()` returnerer mock.
3. **Kompetanse** – Tabell (Pilot, Kompetanse, Gyldig til, Status). Status-badge grønn/gul/rød basert på dager til utløp.
4. **Flåte** – Tabell (Drone, Firmware, Service, Remote ID, Batterihelse, Kalibrering) med OK/Forfaller/Mangler-badges.
5. **Operasjoner** – 5 KPI-kort + liste "Mulige forbedringer".
6. **Safety** – 6 KPI-kort + trendgraf 12 mnd (bruker `recharts` LineChart som allerede finnes i prosjektet).
7. **Internrevisjoner** – Tabell + "Ny revisjon"-knapp. Klikk rad → `AuditDetailDialog` med 6 seksjoner (Organisasjon, Dokumentasjon, Kompetanse, Operasjoner, Teknisk, Safety), hver med sjekkliste + kommentar + vedlegg-placeholder + status. Funn og tiltak håndteres i samme dialog. **All state lokalt (useState/useReducer)** – ingen persistering.
8. **Tilsynspakke** – Kort med "Generer tilsynspakke"-knapp som viser toast `"Tilsynspakke kommer i neste versjon."`. Under: liste over hvilke dokumenter som vil inngå.

## Design

- Følger eksisterende AviSafe designsystem: `Card`, `Badge`, `Progress`, `Tabs`, `Button` fra `@/components/ui/*`.
- Semantiske tokens (`bg-status-green/yellow/red`, `text-primary`, `text-muted-foreground`).
- Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4` for KPI-kort; stacker på mobil.
- Compliance score-ring: enkel SVG med `stroke-primary`.

## i18n

Alle nye strenger via `t()` – nye nøkler i `src/i18n/locales/no.json` og `en.json` under `admin.audit.*`. Følger prosjektets i18n-obligatorisk regel.

## Klargjort for utvidelse

- `complianceScore.ts` isolerer beregning bak ren funksjon.
- Mock-data eksponeres via små hooks (`useAuditDocuments()`, `useAuditFleet()` osv.) slik at bytte til Supabase-queries senere er en ren erstatning inne i hooken.
- `InternalAudit`/`AuditFinding`/`AuditAction`-typer speiler forventet fremtidig DB-skjema.

## Teknisk (bekreftelse)

- Ingen migrations, edge functions, storage-buckets eller Supabase-kall.
- Ingen endringer i eksisterende komponenter utover å legge til én tab-trigger + en tab-content i `Admin.tsx`.
