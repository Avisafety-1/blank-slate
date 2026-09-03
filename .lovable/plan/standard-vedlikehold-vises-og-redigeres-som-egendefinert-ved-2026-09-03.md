# Standard vedlikehold vises og redigeres som egendefinert vedlikehold

Standard vedlikehold ("Inspeksjon og vedlikeholdsintervall") skal se ut og oppføre seg helt likt som de egendefinerte inspeksjonene: samme kort-visning, samme popup-dialog for redigering, og støtte for maler (velg mal / lagre som mal).

Ingen data flyttes. Standard vedlikehold lagres fortsatt i dagens felter på drone/utstyr, slik at alle eksisterende innstillinger, varsler, KPI-er, kalender og AI-risikovurdering fortsetter å virke nøyaktig som i dag.

## Slik blir det

- I drone- og utstyrsdialogen erstattes dagens lange innebygde skjema med ett kort øverst i vedlikeholdslisten: "Standard vedlikehold", med intervaller (dager / flytimer / oppdrag), valgt sjekkliste og neste forfall — nøyaktig samme oppsett som de egendefinerte inspeksjonene under.
- Kortet har blyant-ikon som åpner samme popup-dialog som egendefinerte inspeksjoner. Standardkortet kan ikke slettes (ingen søppelbøtte), siden det er ressursens hovedinspeksjon.
- I popup-dialogen for standard vedlikehold kan man:
  - velge en mal fra det felles malbiblioteket (samme maler som egendefinerte inspeksjoner bruker)
  - lagre gjeldende innstillinger som ny mal
  - sette sjekkliste, startdato, sist/neste inspeksjon, intervall i dager/flytimer/oppdrag, og varselgrenser
  - navnet på standardkortet er låst til "Standard vedlikehold" (ikke fritekst), siden det ikke er en egen rad.
- Alle feltene som finnes i dag beholdes 1:1 i dialogen, med samme automatiske utregning av "neste inspeksjon" fra startdato + intervall.

## Teknisk

- Ingen databaseendringer og ingen migrering av data.
- `MaintenanceSchedulesSection.tsx` utvides til å rendre en "virtuell" standard-oppføring først i listen, bygget fra ressursens felter:
  - drone: `sjekkliste_id`, `inspection_start_date`, `sist_inspeksjon`, `neste_inspeksjon`, `inspection_interval_days/hours/missions`, `varsel_dager/timer/oppdrag`
  - utstyr: `sjekkliste_id`, `sist_vedlikeholdt`, `neste_vedlikehold`, `vedlikeholdsintervall_dager`, `varsel_dager/timer/oppdrag`
- Samme dialogkomponent brukes for begge typer. Ved lagring: hvis oppføringen er standard, skrives det tilbake til `drones`/`equipment` med samme felt-mapping og samme neste-dato-logikk som i dag; ellers til `maintenance_schedules` som nå.
- Malbiblioteket (`maintenance_schedule_presets`) brukes felles; "lagre som mal" fra standardkortet lagrer på samme måte som i dag.
- Det gamle innebygde skjemaet i `DroneDetailDialog.tsx` og `EquipmentDetailDialog.tsx` fjernes fra visningen (samme lagringskall gjenbrukes gjennom den nye dialogen), slik at det bare finnes ett sted å redigere.
- Kortvisningen i `Vedlikehold.tsx` er uendret; standard vedlikehold vises der som før.
