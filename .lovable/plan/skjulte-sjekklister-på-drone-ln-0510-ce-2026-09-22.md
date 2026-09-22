# Skjulte sjekklister på drone LN.0510.CE

## Hva som faktisk er galt

Dronen LN.0510.CE tilhører **Tensio Sør**. Den har fire sjekklister koblet til seg, og to av dem eies av **Tensio Nord** (en sidestilt avdeling):

- «Nødsjekklister» (Tensio Nord)
- «Normale sjekklister DJI Matrice-Mavic» (Tensio Nord) — denne er i tillegg satt som etter-flyging-sjekkliste

Begge er kun delt med morselskapet Tensio, ikke med Tensio Sør, og de er ikke satt som synlige for underavdelinger. Derfor kan ingen i Tensio Sør se dem — og siden redigeringsskjemaet for droner bare viser avkryssingsbokser for sjekklister brukeren har tilgang til, finnes det ingen boks å fjerne haken i. Koblingen blir liggende usynlig og blokkerer start av flytur.

De to andre sjekklistene på dronen (fra Tensio og Tensio Sør) er synlige og i orden.

## Det som skal gjøres

### 1. Rydd koblingene på dronen (engangsfiks)
Fjern de to Tensio Nord-sjekklistene fra LN.0510.CE, og nullstill etter-flyging-sjekklisten som pekte på den ene. De tilsvarende sjekklistene fra Tensio Sør / Tensio blir liggende igjen, så dronen har fortsatt sjekklister.

Ingen dokumenter slettes — kun koblingen fra denne dronen fjernes.

### 2. Gjør skjemaet trygt mot dette i framtiden
I droneskjemaet skal sjekklister som er koblet til, men som brukeren ikke har tilgang til, vises som en egen rad merket «Utilgjengelig sjekkliste» med en fjern-knapp, i stedet for å være helt usynlige. Da kan en administrator alltid rydde opp selv.

### 3. Ikke la usynlige sjekklister blokkere flytur
I start-flytur-dialogen skal sjekklister som ikke kan hentes ikke lenger holde startknappen nede. De vises med en tydelig merknad om manglende tilgang, slik at flyturen kan startes mens admin rydder.

## Teknisk

- Datafiks via migrasjon/oppdatering på `drones` for `c548bc7d-7b1e-4257-9ca0-a40fdf3d048f`: fjern `a29dc8b4-…` og `50094778-…` fra `operations_checklist_ids`, sett `post_flight_checklist_id = null`.
- `src/components/resources/DroneFormFields.tsx`: render valgte ID-er som ikke finnes i `checklists`-listen som egne rader med fjern-knapp.
- `src/components/StartFlightDialog.tsx` / `useChecklists`: skill mellom «ikke fullført» og «ikke tilgjengelig»; kun førstnevnte blokkerer.
- Nye tekster legges i `no.json` og `en.json`.
