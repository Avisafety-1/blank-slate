# Live posisjon: fjern GPS-kravet, ryddigere melding, riktig kallesignal

## 1. Enhetens posisjon skal ikke blokkere start

I dag krever «Start flytur» ved live posisjon at PC-en/nettbrettet selv gir en GPS-posisjon. Mads' PC har ingen GPS, derfor blir knappen grå hos ham mens den virker hos deg.

Endring:
- Kravet fjernes helt. Live posisjon kan startes uansett om enheten har GPS.
- Den røde feilmeldingen om manglende startposisjon fjernes.
- Enhetens posisjon hentes fortsatt i bakgrunnen og brukes som i dag til å sjekke lufttrafikk i området og til å fylle avgangspunkt når den finnes. Mangler den, brukes dronens siste kjente posisjon som avgangspunkt; finnes heller ikke den, lagres flyturen uten avgangspunkt.

## 2. Meldingen når live posisjon er valgt

Dagens melding nevner DroneTag og virker som en feil. Den erstattes av én rolig statuslinje under valgt drone:
- Ved SafeSky-deling: «Live posisjon publiseres nå til SafeSky.»
- Ved «Kun internt»: «Live posisjon deles internt i selskapet.»

## 3. Kallesignal fra selskapets innstillinger

Selskapsinnstillingene for Tensio er allerede satt (prefiks «Tensio.», variabel «dronens registrering»), så forventet kallesignal er `TensioLN0510AB` — ikke `avisafe`. `avisafe01` er koden sin nødløsning som brukes når kallesignalet ikke kan slås opp, typisk fordi flyturen mangler koblet drone.

Endring i publiseringen:
- Slå opp kallesignal på selskapet selv om flyturen mangler drone-ID (bruk prefiks + tomt/teller-suffiks i stedet for `avisafe01`).
- Bruk hierarkiet: mangler avdelingen egne innstillinger, arves morselskapets prefiks/variabel (allerede delvis på plass, gjøres konsekvent).
- Skriv en tydelig logglinje når nødløsningen faktisk brukes, med selskap og flytur-ID, slik at det er sporbart neste gang.
- Sørg for at flyturen alltid lagres med `drone_id` når en live drone er valgt.

## Teknisk

- `src/components/StartFlightDialog.tsx`: fjern `gpsLoading || !gpsPosition` fra Start-knappens `disabled` og fjern `gpsError`-blokken i live-seksjonen; behold GPS-henting for trafikk-sjekk og avgangspunkt; send `gpsPosition ?? valgt live drones posisjon ?? undefined` videre i `onStartFlight`.
- `src/hooks/useLiveDroneSources.ts`: ta med `lat`/`lng` i `LiveDrone` (finnes i `flighthub2_positions` og `dronetag_positions`).
- `src/components/flight/LiveDroneList.tsx` / dialogen: ny statuslinje avhengig av `liveTarget`.
- `supabase/functions/safesky-live-publish/index.ts`: `resolveCallsigns` gir kallesignal per selskap også uten drone-treff; `avisafe01`-fallback kun som siste utvei og med `console.warn`.
- i18n: nye nøkler `flight.livePublishSafesky` / `flight.livePublishInternal` i `no.json` og `en.json`; fjern ubrukte GPS-feilnøkler for live.

Ingen databaseendringer. Advisory-flyten er urørt.
