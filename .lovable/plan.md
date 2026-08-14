# «Ikke logg flytid»-bryter i Logg flytid-dialogen

## Mål
Gi mulighet til å avslutte/lukke ut en flytur uten å registrere flytid, men beholde oppdragsfullføring, avviksrapport og post flight-sjekkliste.

## Slik blir det
- Ny bryter «Ikke logg flytid» plasseres øverst i dialogen, rett under oppdragsvalget (over «Sett oppdrag til fullført»).
- Når bryteren er PÅ:
  - Alt som gjelder flytidslogging skjules: drone, pilot, utstyr, dato, avgangs-/landingssted, flytid, antall bevegelser, operasjonstype, merknad, DroneTag-varsel og oppsummeringsboksen «Flytid logges på».
  - Synlig igjen står: oppdragsvalg, «Sett oppdrag til fullført» og selve bryteren.
  - Knappen nederst endrer tekst fra «Logg flytid» til «Avslutt».
- Når bryteren er AV oppfører dialogen seg nøyaktig som i dag.

## Oppførsel ved «Avslutt»
- Ingen rad opprettes i flight_logs, ingen validering av drone/sted/flytid, ingen automatisk oppretting av oppdrag.
- Hvis «Sett oppdrag til fullført» er på og et oppdrag er valgt: oppdraget settes til fullført som normalt.
- Post flight-sjekkliste: kjøres videre som i dag. Siden dronefeltet er skjult, hentes sjekklisten fra oppdragets tilknyttede drone (eller valgt drone hvis den finnes fra før via forhåndsutfylling).
- Avviksrapport: samme flyt som i dag når oppdrag er valgt og selskapet har avvik aktivert — men uten flight_log-id (kobles kun til oppdraget).
- Etterpå nullstilles skjemaet og dialogen lukkes som vanlig.

## Teknisk
- `src/components/LogFlightTimeDialog.tsx`: ny state `skipFlightLog`; betinget rendering av alle flytidsfelt; tidlig gren i `handleSubmit` som hopper over validering/insert og går rett til mission-fullføring → post flight-sjekkliste → `finishFlow(missionId, null)`; nullstilles i `resetFormState` og ved åpning av dialogen.
- Oppslag av `post_flight_checklist_id` gjøres via oppdragets drone når `skipFlightLog` er på og `formData.droneId` er tom.
- i18n: nye nøkler `logFlight.skipFlightLog` og `logFlight.finish` i både `no.json` og `en.json`.
