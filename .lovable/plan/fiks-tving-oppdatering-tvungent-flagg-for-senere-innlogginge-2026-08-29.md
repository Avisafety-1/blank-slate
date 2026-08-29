# Fiks «Tving oppdatering» + tvungent flagg for senere innlogginger

## Del 1: Fiks broadcast-sendingen (hovedbuggen, verifisert i koden)

- `src/pages/Admin.tsx` (begge knappene, ~linje 920 og ~960): oppretter `supabase.channel('global-force-reload')` og kaller `channel.send(...)` **uten å subscribe først**. Supabase broadcast krever at kanalen er subscribet før `send` leveres – ellers når meldingen aldri frem. I tillegg sendes det to ganger per klikk (to kanaler).
- I dag er det kun `app_version`-bumpet som virker: brukere får banneret «Oppdater nå» via versjonssjekken, aldri tvungen reload.

### Endring i `Admin.tsx` (begge knappene)

1. Bump `app_version` i `app_config` først.
2. Opprett én kanal, `await channel.subscribe()`, vent til `SUBSCRIBED` (timeout ~5s, tydelig feil ved feil).
3. Send én broadcast med `{ forceImmediate, version }`.
4. `supabase.removeChannel(channel)` i `finally`.

### Mottakerlogikken (uendret)

- **«Send oppdateringssignal»** (`forceImmediate: false`) → statuslinje med «Oppdater nå»-knapp. Ingen tvungen reload.
- **«Tving umiddelbart»** (`forceImmediate: true`) → appen reloader umiddelbart uten varsel hos tilkoblede brukere.

## Del 2: Tvungen oppdatering også for brukere som logger inn senere

Problem: brukere som var avlogget/offline da «Tving umiddelbart» ble trykket, får i dag kun det frivillige banneret ved neste innlogging (versjonsmismatch). Ønsket: de skal også oppdateres uten varsel.

### Endring

- `Admin.tsx` («Tving umiddelbart»): i tillegg til versjonsbump, sett en ny nøkkel i `app_config`, f.eks. `app_version_force_immediate = <versjon>`, som markerer at alle med eldre lokal versjon enn denne skal tvinges. «Send oppdateringssignal» rører ikke denne nøkkelen.
- `useForceReload.ts` (Layer 2, versjonssjekk ved online/mount): hent begge nøklene. Hvis lokal versjon er eldre enn `app_version_force_immediate` → kall `performReload()` direkte (uten banner). Ellers, ved vanlig versjonsmismatch → vis banner som i dag.
- Vurder å nullstille/cleare `app_version_force_immediate` etter en velykket tvungen reload, slik at en gammel tvungen versjon ikke tvinger reload på evig loop hvis versjonssammenligningen glipper. Enklere alternativ: aldri nullstill – flagget tvinger kun reload når lokal versjon faktisk er eldre, og `performReload` lagrer ny versjon før reload, så det skjer maks én gang per bruker.

## Risikovurdering: lav

- Kun to filer endres (`Admin.tsx`, `useForceReload.ts`). Ingen databaseendringer (gjenbruker eksisterende `app_config`-tabellen, ingen nye kolonner/tabeller/RLS).
- Samme versjonsformat (numerisk streng) brukes for begge nøkler.
- Confirm-dialoger beholdes. `performReload()` synker offline-kø og lagrer versjon før reload – eksisterende sikkerhetsmekanismer gjenbrukes.
- Største rest-risiko: evig reload-loop hvis versjonslagring feiler. Demper: `performReload` persisterer versjonen **før** reload, og tvang kun ved faktisk eldre versjon.
- Begrensning (uunngåelig): brukere uten nett/gyldig sesjon kan ikke tvinges – de får det når de kobler til.

## Verifisering

- Typecheck.
- To faner (admin + bruker): «Send oppdateringssignal» → banner; «Tving umiddelbart» → reload uten banner.
- Simuler offline-bruker: tving oppdatering mens bruker er avlogget → ved innlogging skjer reload uten banner.
