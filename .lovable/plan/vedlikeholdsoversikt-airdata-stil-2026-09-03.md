# Vedlikeholdsoversikt (Airdata-stil)

En ny samlet vedlikeholdsside med statuslinjer for flytimer, antall oppdrag/flights og dager — for både droner og utstyr, med mulighet til å utføre vedlikehold eller nullstille direkte fra listen.

## Inngang

- To nye knapper på /ressurser, plassert der de røde ringene er: én i toppen av "Droner"-kortet og én i toppen av "Utstyr"-kortet (ikon + "Vedlikehold").
- Begge åpner samme side; droneknappen åpner Droner-fanen, utstyrsknappen Utstyr-fanen.

## Siden

Ny rute `/vedlikehold` med to faner øverst: **Droner** og **Utstyr**.

Per rad (én rad per drone/utstyr, hele lista nedover):

```text
DJI Air 3S Frode      Status: Gul     [Utfør vedlikehold] [Nullstill]
Flytimer   [██████░░░░]  190 / 400
Oppdrag    [████████░░]  39 / 40
Dager      [█████░░░░░]  22 dager igjen (neste: 25.09.2026)
```

- Fargelogikk på hver bar gjenbruker eksisterende statusregler (grønn / gul ved varselmargin / rød ved overskredet).
- Intervaller som ikke er satt på ressursen vises som "Ikke satt" uten bar.
- Sortering: forfalt først, deretter nærmest forfall. Søkefelt + statusfilter (Alle / Grønn / Gul / Rød) øverst.
- Radene er klikkbare og åpner eksisterende detaljdialog for drone/utstyr.

## Handlinger

- **Utfør vedlikehold**: bekreftelsesdialog med valgfri notat-tekst, kjører samme logikk som i dag (setter sist utført til nå, beregner neste dato fra intervall, låser timer/oppdrag-teller til dagens verdi og skriver loggoppføring).
- **Nullstill**: nullstiller kun tellerne (timer/oppdrag/dato-referanse) uten å registrere et gjennomført vedlikehold, med egen bekreftelse så det ikke forveksles.
- Begge oppdaterer listen umiddelbart og respekterer eksisterende tilgangsregler.

## Teknisk

- Ny side `src/pages/Vedlikehold.tsx` + rute i `App.tsx`, med `?tab=droner|utstyr`.
- Ny komponent `src/components/maintenance/MaintenanceRow.tsx` med en gjenbrukbar `MaintenanceBar` (verdi/grense/status).
- Statusberegning gjenbruker `calculateMaintenanceStatus`, `calculateUsageStatus` og reason-funksjonene i `src/lib/maintenanceStatus.ts` — ingen ny statuslogikk.
- Drone-vedlikehold gjenbruker `performDroneInspection` i `src/lib/droneInspection.ts`; tilsvarende eksisterende oppdateringslogikk for utstyr (`neste_vedlikehold`, `hours_at_last_maintenance`, logg-oppføring).
- Oppdrag siden sist: gjenbruker `countUniqueMissionsSinceInspection`, hentet i én samlet spørring for lista.
- Ingen databaseendringer, ingen endringer i RLS.
- Alle nye tekster via `t()` med nøkler i både `no.json` og `en.json`.
