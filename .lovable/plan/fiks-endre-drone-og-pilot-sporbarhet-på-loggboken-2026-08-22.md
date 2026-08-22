# Fiks «Endre drone og pilot» + sporbarhet på loggboken

## Hva som er galt (verifisert)

- Dronelisten er tom fordi spørringen henter en kolonne som ikke finnes i `drones` (det finnes ingen `navn`-kolonne — dronene identifiseres med `modell`, `serienummer`, `internal_serial`, `registration_number`). Spørringen feiler, og lista blir tom.
- Både drone- og personellista er låst til nøyaktig ett selskap (`company_id` på flyloggen). Resten av appen bruker hierarkiet (`get_user_visible_company_ids`), så droner/personell i under- eller morselskap du har tilgang til vises ikke.
- Flyloggen viser «Ikke satt» på drone fordi loggen faktisk ikke har drone knyttet til seg (285 av 1270 flylogger i basen mangler drone-kobling).
- Det finnes i dag ingen visning som viser hvilke loggbokoppføringer/flytimer denne loggen faktisk har generert.

## Endringer

### 1. Dialogen «Endre drone og pilot»
- Hent droner med riktige kolonner og vis en tydelig etikett: modell + serienummer/registreringsnummer (fallback til internt serienummer).
- Hent droner og personell for alle selskaper brukeren har tilgang til via `get_user_visible_company_ids`, med selskapsnavn som gruppering/suffiks når det er flere selskaper.
- Vis lastestatus og en tydelig melding hvis lista er tom, i stedet for en tom nedtrekksmeny.
- Tillat å endre kun drone eller kun pilot (lagre-knappen aktiveres så snart ett av feltene er endret), og la drone-feltet også kunne settes når loggen ikke har drone fra før.
- Feilmeldinger fra spørringene fanges opp og vises som toast i stedet for å bli slukt.

### 2. Fanen «Loggført på» — sporbarhet
Legg til en verifiseringsdel som viser hva denne flyloggen faktisk har påvirket:
- Dronens loggbokoppføringer knyttet til flyturen (antall + dato/type), med lenke til dronens loggbok.
- Pilotens loggbokoppføringer knyttet til flyturen (`personnel_log_entries.flight_log_id`).
- Flytiden loggen bidrar med, og dronens akkumulerte flytid nå.
- Hvis loggen ikke har drone: tydelig varsel om at ingen dronetimer/loggbok er oppdatert, med oppfordring til å sette drone via «Endre».

### 3. Etter endring
- Etter reassign oppdateres visningen slik at ny drone/pilot og de nye loggbokoppføringene vises umiddelbart.

## Teknisk

- `src/components/dashboard/ReassignFlightLogDialog.tsx`: ny henting (RPC for synlige selskaper + `drones`/`profiles` med `.in("company_id", ids)`), riktige kolonner, feilhåndtering, lasting/tom-tilstand, justert disabled-logikk.
- `src/lib/flightAnalysisTrack.ts` / `FlightSummaryPanel.tsx`: hent og vis relaterte `drone_log_entries` og `personnel_log_entries` samt dronens `flyvetimer` for verifisering.
- `src/lib/flightLogReassign.ts`: håndter tilfellet der loggen ikke hadde drone fra før (kun legg til timer), og bruk loggens `company_id` når nye oppføringer opprettes.
- Alle nye strenger legges i både `no.json` og `en.json`.
