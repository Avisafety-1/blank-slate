# Redesign av «Live posisjon» i Start flyging

Live posisjon skal ikke lenger være låst til DroneTag. Den skal kunne bruke både DroneTag-enheter og droner som sender posisjon via FlightHub 2 / MQTT (`flighthub2_positions`), og se ut som løsningen på mil.avisafe.no.

## Slik blir det for brukeren

1. Under «SafeSky-publisering» beholdes de tre valgene: Av, Advisory (rute), Live posisjon.
2. «Live posisjon» får merkelapper som viser hvilke kilder selskapet har: DroneTag, FlightHub 2, og om delingen går til SafeSky eller kun internt.
3. Når Live posisjon er valgt, kommer et nytt valg: **SafeSky** eller **Kun internt**. Standard følger selskapets innstilling (SafeSky-deling på/av).
4. Under kommer en liste «Live drone \*» med alle droner som faktisk sender posisjon nå:
   - grønn prikk når posisjonen er fersk (≤ 30 s), grå/rød når den er gammel eller borte
   - dronenavn, og under: serienummer/kallesignal, høyde, batteri, kilde (DroneTag / FlightHub 2)
   - «x sek siden» til høyre, oppdateres hvert 5. sekund
   - hele raden er klikkbar; valgt rad er uthevet
5. Velger man et oppdrag, forhåndsvelges automatisk den live-dronen som er knyttet til oppdraget — også når flere droner er live. Det vises «Automatisk valgt fra oppdragets drone», og man kan overstyre.
6. Er ingen droner live, vises en tydelig melding om at ingen posisjon mottas, med hint om hva som må sjekkes. Start-knappen krever fortsatt at en live drone er valgt.

## Teknisk

- `src/components/StartFlightDialog.tsx`:
  - Ny felles hook/hjelper `useLiveDroneSources(companyId, open)` som slår sammen to kilder til én liste `LiveDrone { key, droneId, droneName, label, source: 'dronetag' | 'fh2', lastSeen, heightM, batteryPct, dronetagDeviceId }`:
    - DroneTag: `dronetag_devices` + siste `drone_telemetry` per drone
    - FH2/MQTT: siste rad per `sn` i `flighthub2_positions` for selskapet (siste 5 min), koblet til `drones` via `serienummer` for navn og `drone_id`
  - Erstatter dagens `livePosFreshness`-poll og DroneTag-`Select` med den samme 5-sekunders pollen som mater listen.
  - Auto-valg: `mission_drones` → `drone_id` matches mot `LiveDrone.droneId`; treff vinner uansett kilde. Manuelt valg nullstiller auto-flagget.
  - Nytt delvalg `liveTarget: 'safesky' | 'internal'`, initiert fra `flighthub2_webhook_config.safesky_forward` / DroneTag-oppsett.
  - `onStartFlight` utvides med valgt drone (`droneId`) i tillegg til dagens `dronetagDeviceId`, slik at FH2-droner også registreres.
- `src/pages/Index.tsx` (`confirmStartFlight`): lagrer `drone_id` på `active_flights` (kolonnen finnes allerede) og setter `safesky_published` ut fra `liveTarget`.
- Ny underkomponent `src/components/flight/LiveDroneList.tsx` for listen, slik at dialogen ikke vokser mer.
- Ingen databaseendringer: `active_flights.drone_id` og `dronetag_device_id` finnes allerede.
- i18n: nye nøkler under `flight.*` i både `no.json` og `en.json`.
- Design bruker eksisterende tokens (border/muted/primary, grønn statusprikk som i dag) — ingen nye farger.

## Utenfor omfang

- Endringer i MQTT-bridge eller `flighthub2_positions`-skriving.
- Kartvisningen av live droner (bruker allerede samme data).
