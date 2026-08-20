# Vær for oppdragstidspunktet

I dag henter værpanelet alltid været *nå* (MET-kallet leser `timeseries[0]` og lager 24 timer fremover fra nåtid). Det betyr at et oppdrag som starter om tre dager viser dagens vær. Dette endres slik at værboksen på oppdragskortet gjelder oppdragets start.

## Slik blir det

- Værpanelet på oppdragskortet, i oppdragsdetaljer og i opprett/rediger-dialogen viser prognosen for **oppdragets start-tidspunkt**, ikke nåtid.
- Overskrift/etikett i panelet viser hvilket tidspunkt prognosen gjelder (dato + klokkeslett), slik at det er tydelig at det ikke er "nå".
- Timeslinjen (timeprognosen) sentreres rundt oppdragets starttid i stedet for å starte på nåværende time.
- Er oppdraget **mer enn 10 dager frem i tid**: panelet viser en tom, rolig informasjonsboks: "Værdata er kun tilgjengelig inntil 10 dager frem i tid. Prognosen oppdateres automatisk når det er mindre enn 10 dager til oppdragsstart." Ingen feilmelding, ingen falske tall.
- Fullførte oppdrag med lagret værsnapshot fungerer som i dag (viser det låste snapshotet).
- Mangler oppdraget starttid, brukes nåtid som i dag.

Merk om datakilden: MET gir timesoppløsning omtrent de første ~2,5 døgnene, deretter 6-timers steg ut til ~10 døgn. For oppdrag lenger frem enn ca. 2,5 døgn viser vi derfor nærmeste tilgjengelige prognosepunkt (kan være inntil 3 timer unna oppdragstiden). Dette markeres diskret i panelet.

## Teknisk

**`supabase/functions/drone-weather/index.ts`**
- Ta imot valgfri `targetTime` (ISO) i request-body, i tillegg til `lat`/`lon`.
- Cache-nøkkel utvides med målingstimen (avrundet til time) slik at ulike oppdrag ikke deler feil cache.
- Ny hjelpefunksjon som finner indeksen i `properties.timeseries` nærmest `targetTime`; brukes til `current`, advarsler (`evaluateWeatherForDrone`) og `forecast_6h`.
- `generateHourlyForecast` tar startindeks som parameter: vinduet starter noen timer før måltidspunktet og dekker 24 punkter (eller færre hvis serien tar slutt). `findBestFlightWindow` kjører på samme vindu.
- Responsen får `target_time` (ønsket tid), `forecast_time` (faktisk brukt prognosepunkt), `forecast_resolution_hours` og `out_of_range: boolean` når `targetTime` er utenfor serien.

**`src/components/DroneWeatherPanel.tsx`**
- Ny prop `targetTime?: string | null`.
- Sender `targetTime` med i `functions.invoke`, og re-henter når den endres.
- Før kall: er `targetTime` mer enn 10 dager frem → render informasjonsboksen og hopp over API-kallet.
- Viser badge/undertekst med formatert `forecast_time`, og en note når avviket fra oppdragstid er ≥ 1 time.

**Kallsteder**
- `src/components/oppdrag/MissionCard.tsx`, `src/components/dashboard/MissionDetailDialog.tsx`: send oppdragets start (dato + tid) som `targetTime`.
- `src/components/dashboard/AddMissionDialog.tsx`: send valgt dato/tid fra skjemaet, slik at været i skjemaet oppdaterer seg når man endrer tidspunkt.

**i18n**
- Nye nøkler under `safety.weatherPanel` i både `no.json` og `en.json`: `forecastFor`, `outOfRangeTitle`, `outOfRangeDescription`, `nearestForecastNote`.
