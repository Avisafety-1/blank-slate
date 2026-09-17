# Hvorfor Mads ikke får startet flytur med live drone

## Årsaken (bekreftet)

Det er ikke tilgangsrettigheter. Mads har samme selskap (Tensio) og samme rolle-nivå, og live-dronen (LN.0510.AB) vises riktig i listen hans.

Feilen står i rødt i bildet hans: maskinen hans klarer ikke å hente egen GPS-posisjon. I dag krever «Start flytur» ved live posisjon at enheten selv gir en GPS-posisjon — den brukes kun som avgangspunkt. Uten den blir knappen grå, selv om dronen sender posisjon helt fint. Din maskin gir GPS, derfor fungerer det hos deg.

Typisk skjer dette på stasjonær PC uten GPS-mottaker, eller når nettleseren nekter posisjonstilgang.

## Hva som endres

1. Enhetens GPS blir valgfri for live posisjon. Mangler den, brukes dronens egen siste posisjon som avgangspunkt.
2. Har vi hverken enhets-GPS eller drone-posisjon, brukes oppdragets startpunkt hvis et oppdrag er valgt.
3. Bare hvis ingen av delene finnes, blokkeres start — og da med en tydelig melding om hvorfor.
4. Den røde teksten endres til en nøytral opplysning: «Bruker dronens posisjon som avgangspunkt» når vi faller tilbake på dronen.

## Teknisk

- `src/components/StartFlightDialog.tsx`:
  - Ny avledet verdi `effectiveStartPosition` = enhets-GPS → valgt live drones siste posisjon (lat/lng fra `useLiveDroneSources`) → valgt oppdrags start.
  - Start-knappens `disabled` bytter `(publishMode === 'live_uav' && (gpsLoading || !gpsPosition))` med `(publishMode === 'live_uav' && !effectiveStartPosition)`; ventetid på GPS beholdes kun mens `gpsLoading` og ingen fallback finnes.
  - `onStartFlight(...)` sender `effectiveStartPosition` i stedet for `gpsPosition`.
  - GPS-feilteksten vises som `text-muted-foreground` når fallback finnes, fortsatt `text-destructive` når ingenting finnes.
- `src/hooks/useLiveDroneSources.ts`: utvid `LiveDrone` med `lat`/`lng` (finnes allerede i `flighthub2_positions` og `dronetag_positions`, bare ikke tatt med i dag).
- i18n: nye nøkler under `flight.*` i både `no.json` og `en.json` (fallback-melding + «ingen startposisjon tilgjengelig»).

Ingen databaseendringer, ingen endringer i tilgangsregler eller SafeSky-flyten.
