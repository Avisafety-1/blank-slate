# Forbedre "Oppdrag til godkjenning"-seksjonen

Endringer kun i `src/components/ProfileDialog.tsx`. Ingen DB-/logikk-endringer.

## Mål
- Kortene utnytter full bredde og får tydeligere hierarki.
- Hvert oppdrag viser samme badge-sett som "Kommende oppdrag" på dashbordet (status, godkjenning, SORA, AI-risiko, sjekkliste, NOTAM).
- Lokasjon, pilot(er) og avdeling/selskap vises tydelig.

## Datahenting (utvides i `fetchUserData` der pendingApprovalMissions bygges)
Når `missionIds.length > 0`, kjør i parallell sammen med eksisterende `mission_risk_assessments` + `mission_personnel`:
- `mission_sora` (`mission_id, sora_status`) → `soraMap`.
- `mission_documents` (`mission_id`) → `documentCountsMap`.
- `mission_personnel` utvides til også å hente `role` + joine profilnavn:
  `select('mission_id, role, profile:profile_id(id, fornavn, etternavn)')`
  Bygg `personnelDetailsMap[mission_id] = [{ id, name, role }]` (rolle "Pilot"/"PIC" prioriteres først i visning).
- `companies` (`id, navn`) for unike `company_id` i pending-listen → `companyNameMap`.

Sett disse på hvert mission-objekt: `sora`, `documentCount`, `personnel_details`, `company_name`. Behold eksisterende `aiRisk` og `personnel_profile_ids`.

## Visuell oppdatering av kortet (linjer ~2110–2215)
Layout-grid:
```
[ Tittel ............................................. avdeling-badge ]
[ status | godkjenning | SORA | AI 5.0 | Sjekkliste | NOTAM | dokumenter ]
[ 📍 Lokasjon            📅 Dato + tid             👤 Pilot, Personell ]
[ ─────────────────────────────────────────────────────────────────── ]
[ [Kommentar]                                      [Godkjenn]         ]
```

Konkret:
- Kortcontainer: behold rammen, men gjør `space-y-3`, fjern `overflow-hidden` der det klipper badger. La det fylle full bredde (er allerede `w-full` via Card; ingen max-width).
- Header-rad: tittel `font-semibold text-base`, og hvis `company_name` finnes vises en avdeling-badge til høyre (samme stil som dashbordets `Building2`-badge) med `ml-auto`.
- Badge-rad (bruk hjelpere fra `src/lib/oppdragHelpers`): `statusColors`, `getApprovalStatusColor/Label`, `getSoraBadgeColor` (+ "SORA: {status}"), `getAIRiskBadgeColor` med hjerne-ikon og `overall_score.toFixed(1)`, sjekkliste-badge (grønn hvis alle `checklist_ids ⊆ checklist_completed_ids`, ellers grå), NOTAM-badge via `getNotamBadgeColor(!!notam_submitted_at)`, og dokumenttall-badge hvis > 0. Badge-raden bruker `flex flex-wrap gap-1.5`.
- Meta-rad: tre kolonner via `grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-muted-foreground`:
  - 📍 `mission.lokasjon`
  - 📅 dato + klokkeslett (samme format som dashbordet, `dd. MMM HH:mm`)
  - 👤 personell: "Pilot: {navn}" + ev. "+N" tooltip. Hvis ingen pilot-rolle, vis første personell.
- Knappe-rad: legg `Godkjenn`-knapp til høyre (`ml-auto`) slik at "Kommentar" og "Godkjenn" får luft i bred visning. På mobil stables knappene som før (`flex flex-wrap`).
- Selvgodkjennings-banner og kommentar-/godkjenn-paneler beholdes uendret i atferd, bare innenfor det nye layoutet.

## Hva som ikke endres
- All forretningslogikk (`handleApproveMission`, `handleSaveComment`, `handleNotifyPilot`, `selfApprovalBlocked`-regelen, RLS-tilgang) er uendret.
- Ingen endringer i andre filer, ingen nye spørringer utenfor de nevnte.

## Tekniske detaljer
- Importer som allerede mangler: `Brain`, `ClipboardCheck`, `Radio`, `FileText`, `Building2`, `User`, `Users` fra `lucide-react` (sjekk eksisterende import-liste, legg bare til de som mangler).
- Importer hjelpere fra `@/lib/oppdragHelpers`.
- `date-fns` `format` + `nb` locale brukes allerede andre steder i filen; gjenbruk eller importer på samme måte som dashbordet.
- Personell-spørringen joiner via `profile:profile_id(...)`; krever at `mission_personnel` har FK til `profiles` (er allerede brukt andre steder i prosjektet).
