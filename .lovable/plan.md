# DJI auto-synk — Elverum Videregående Skole

## Status i dag (hentet fra databasen nå)

Selskapet `Elverum Videregående Skole` har tre brukere med DJI-innlogging lagret:

| Bruker | E-post | Auto-synk | Siste synk |
|---|---|---|---|
| Dronepilot ELVIS | selv.dronefag@innlandetfylke.no | **På** | 22.08.2026 19:48 |
| Sverre Rasmussen | sveras@innlandetfylke.no | **På** | 16.08.2026 21:00 |
| Martin Sunnevåg Madsbu | matmad@innlandetfylke.no | Av | 13.08.2026 07:09 |

Køen (`dji_sync_jobs`) har 170 jobber for disse brukerne, alle med status `done`.
Nyeste jobb ble lagt inn 22.08.2026 19:26 — altså ingenting nytt er hentet inn
siden 22. august, og ingenting står fast i kø.

## Foreslått handling: tvungen synk nå

Kjør en manuell enqueue + worker-runde for de tre brukerne, uten kodeendringer:

1. Kall `dji-sync-enqueue` med `{ userId }` for hver av de tre brukerne
   (inkludert Martin, selv om auto-synk er av — manuell kjøring bruker
   lagrede credentials og påvirkes ikke av `auto_sync_enabled`).
2. Kall `dji-sync-worker` til køen er tom, eller la den planlagte
   worker-kjøringen ta jobbene.
3. Rapporter tilbake per bruker: hvor mange nye logger som ble lagt i kø,
   hvor mange som ble ferdigstilt, og eventuelle feil (typisk 401 fra
   DroneLog hvis passordet er endret).

Ingen databaseendringer, ingen kodeendringer — kun kall mot eksisterende
edge-funksjoner.

## Risiko

- Hvis DJI-passordet til en bruker er utdatert, feiler enqueue for den
  brukeren med innloggingsfeil. Det er isolert per bruker og påvirker ikke
  de andre.
- Nye logger kan gi nye flylogg-oppføringer som må matches mot droner/oppdrag,
  på vanlig måte via loggfil-flyten.

## Valgfritt tillegg (si fra hvis dette ønskes)

Skru på `auto_sync_enabled` for Martin Sunnevåg Madsbu, slik at alle tre
brukerne synkes automatisk framover.
