# Flere vedlikeholdstyper på utstyr og batteri

Utstyrs- og batterikortet viser i dag kun ett vedlikehold (standardintervallet), med egne progresjonsbarer og én «Utfør vedlikehold»-knapp. Ekstra inspeksjoner ligger bare skjult i listen «Vedlikehold og inspeksjoner», og det finnes ingen måte å velge hvilken inspeksjon man utfører. Dronekortet har allerede fanevisningen. Denne endringen gir utstyr/batteri samme visning – og gjør «Utfør vedlikehold» gjeldende for den valgte fanen på både drone og utstyr.

## Utstyrs- og batterikortet

- Erstatt dagens løse flytimer-/oppdrag-barer og «Vedlikehold»-blokken med samme fanekort som dronekortet:
  - Én fane per inspeksjon (Standard + hver egendefinert), fargeprikk for status og «Neste ut»-merke på den som forfaller først.
  - Valgt fane viser sist utført, neste forfall, dager igjen, sjekkliste og barer for flytimer / oppdrag.
- For batterier vises i tillegg en ladesyklus-bar (sykluser siden sist / intervall) i fanen, med samme fargeregler.
- Kollapsbare «Vedlikeholdsdetaljer» og listen «Vedlikehold og inspeksjoner» (legg til / rediger / slett) beholdes som i dag.

## «Utfør vedlikehold» gjelder valgt fane

- Knappen ligger i fanekortet og gjelder alltid den inspeksjonen som er valgt – både på drone- og utstyrskortet (i dag vises den kun på standardfanen).
- Standardfane: uendret oppførsel (dagens logikk for drone/utstyr).
- Egendefinert fane: markerer den inspeksjonen som utført – oppdaterer sist utført, neste forfall fra intervallet, og låser time-/oppdrags-/syklustellerne, samt skriver loggboksoppføring med inspeksjonens navn.
- Har den valgte inspeksjonen en sjekkliste, åpnes sjekklistedialogen først, som i dag. Bekreftelsesdialogen viser navnet på inspeksjonen som utføres.

## Teknisk

- `src/components/resources/InspectionOverview.tsx`: utvides med valgfri `extraStandardBars`/syklusstøtte (`totals.totalCycles`, `interval_cycles`/`warn_cycles`/`cycles_at_last`) og med `actionSlot` som funksjon av aktiv fane (`(view) => ReactNode`) i stedet for kun standardfanen.
- `src/components/resources/EquipmentDetailDialog.tsx`: fjerner de manuelle time-/oppdragsbarene og «Vedlikehold»-headeren, og rendrer `InspectionOverview` med `kind="utstyr"`, standardfeltene fra `equipment` og totaler (`flyvetimer`, unike oppdrag via `fetchTotalMissionsFor`, `battery_cycles`).
- `src/components/resources/DroneDetailDialog.tsx`: `actionSlot` gjøres tilgjengelig på alle faner; utførelse på egendefinert fane kaller `performSchedule` fra `src/lib/maintenanceSchedules.ts`.
- Gjenbruker `performSchedule`, `calculateScheduleProgress` og `fetchTotalMissionsFor` – ingen ny statuslogikk, ingen databaseendringer, ingen endring i tilgangsregler.
- Nye tekster via `t()` med nøkler i både `no.json` og `en.json`.
