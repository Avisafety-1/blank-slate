# Live-status for droner

Et nytt statuslys rett under det eksisterende vedlikeholdslyset på hvert dronekort, som viser om dronen sender live posisjon akkurat nå.

## Hva brukeren ser

- Samme utseende som dagens statuslys (samme prikk, font og fargetoner), plassert rett under.
- Tre tilstander:
  - Grønn: «Live» — posisjon mottatt de siste 30 sekundene
  - Gul: «Nylig» — posisjon mottatt for 30 sekunder til 5 minutter siden
  - Rød: «Offline» — ingen posisjon siste 5 minutter
- Vises begge steder: dronelisten som åpnes fra dashbordet, og dronekortene på /ressurser.
- Oppdaterer seg selv fortløpende uten at siden lastes på nytt.

## Slik kobles riktig drone

Hver posisjon identifiseres med dronens serienummer. Vi matcher mot både vanlig serienummer og internt serienummer, slik at riktig drone alltid treffes.

## Teknisk

Ny hook `src/hooks/useLiveDroneStatus.ts`:
- Ett engangskall mot `flighthub2_positions`: `select sn, drone_id, time_stamp` for `company_id`, `time_stamp >= now() - 5 min`, sortert synkende, `limit 200`. Bygger `Map<sn, timestamp>` (siste per sn).
- Én realtime-kanal (`postgres_changes`, INSERT/UPDATE på `flighthub2_positions`, filter `company_id=eq.<id>`) som kun oppdaterer tidsstempel for aktuell `sn` i et ref, med throttling — state settes maks hvert 5. sekund, så vi unngår re-render per melding.
- En lokal 5-sekunders `setInterval` reberegner kun fargetilstand (alder), slik at grønn → gul → rød skjer uten nettverkstrafikk.
- Abonnement ryddes i `useEffect`-cleanup (`supabase.removeChannel`).
- Hooken returnerer `getLiveStatus(serienummer, internalSerial) => 'live' | 'recent' | 'offline'` — matching skjer i minnet mot allerede innlastede dronerader, ingen ekstra oppslag per drone.

Ny presentasjonskomponent `src/components/LiveStatusBadge.tsx` som gjenbruker markupen fra `StatusBadge` (`w-3 h-3 rounded-full` + `text-sm font-medium`) med `bg-status-green/yellow/red`.

Integrasjon:
- `src/components/dashboard/DroneListDialog.tsx`: kall hooken én gang i dialogen (kun når `open`), rendre badge under `StatusBadge` i samme høyre kolonne.
- `src/pages/Resources.tsx`: kall hooken én gang på siden, rendre badge under eksisterende `StatusBadge` i dronekortet (linje ~646).

i18n: nye nøkler `resources.live.live` / `recent` / `offline` i både `no.json` og `en.json`.

Ingen databaseendringer utover at `flighthub2_positions` må ligge i realtime-publikasjonen; hvis den ikke gjør det, legges den til i en migrasjon (`ALTER PUBLICATION supabase_realtime ADD TABLE`), og hooken faller uansett tilbake på periodisk oppfriskning hvert 20. sekund.

## Validering

`npx tsgo --noEmit -p tsconfig.app.json && git diff --check`
