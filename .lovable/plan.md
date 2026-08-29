# Fiks «Tving oppdatering» – send broadcast via subscribet kanal

## Årsak (verifisert i koden)

- `src/pages/Admin.tsx` (begge knappene, linje ~920 og ~960): oppretter `supabase.channel('global-force-reload')` og kaller `channel.send(...)` **uten å subscribe først**. Supabase broadcast krever at kanalen er subscribet før `send` leveres – ellers når meldingen aldri frem til brukerne.
- Det som derimot fungerer er `app_version`-bumpen i `app_config`. Når brukere kommer online sjekker `useForceReload` (Layer 2) versjonen og viser banneret med «Oppdater nå» – uansett om du trykket «Tving umiddelbart» eller ikke.
- Resultat: brukere får alltid banner, aldri tvungen reload.

## Endring

I `src/pages/Admin.tsx`, begge knappene:

1. Bump `app_version` i `app_config` først (som i dag).
2. Opprett kanalen, `await channel.subscribe()` og vent til status er `SUBSCRIBED` (med timeout ~5s og feil hvis det feiler).
3. Send én broadcast med `{ forceImmediate, version: nextVersion }`.
4. `supabase.removeChannel(channel)` i `finally`.

Dette fjerner også den doble sendingen (to kanaler per klikk) som finnes i dag.

## Ønsket oppførsel (uendret i mottakerlogikken)

- **«Send oppdateringssignal»** (`forceImmediate: false`) → brukere ser fortsatt statuslinjen med «Oppdater nå»-knapp. Ingen tvungen reload.
- **«Tving umiddelbart»** (`forceImmediate: true`) → appen oppdateres umiddelbart uten varsel/banner hos brukeren.
- `useForceReload.ts` har allerede riktig logikk for dette – kun sender-siden i `Admin.tsx` må fikses slik at broadcast-meldingen faktisk når frem (subscribe før send).
- Offline-brukere får fortsatt oppdateringen via versjonssjekken når de kobler til igjen (frivillig banner for dem – det kan ikke tvinges da de ikke er tilkoblet).

## Robusthet og begrensninger

- Hvis broadcast-subscription feiler, kaster vi en tydelig feil og ruller ikke tilbake `app_version`-bumpet. Offline/fremtidige brukere får da fortsatt banner via versjonssjekken.
- Kun brukere med aktiv Supabase Realtime-tilkobling og gyldig sesjon mottar tvungen reload. Brukere uten nett eller med avbrutt websocket får oppdateringen først når de kobler til igjen.
- «Tving umiddelbart» kan medføre tap av ulagret arbeid; confirm-dialogen beholdes.
- Ingen databaseendringer, ingen nye tabeller, ingen RLS-endringer.

## Verifisering

- Typecheck.
- Åpne appen i to faner (én admin, én vanlig bruker), trykk «Tving umiddelbart» og bekreft at bruker-fanen reloader uten banner, og at «Send oppdateringssignal» viser banner.
