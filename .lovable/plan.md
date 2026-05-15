## Mål

Gjøre "Live posisjon"-knappen i Start-flyging til den **reelle utløseren** for at FH2-posisjoner videresendes til SafeSky. Selskapets toggle i "Mitt selskap" beholdes som en master-tillatelse (av/på på org-nivå), men selve delingen krever at en pilot har en aktiv "Live"-flyging på den spesifikke drona.

## Hvordan det skal virke (hybrid-modell)

```text
SafeSky-deling skjer KUN når BÅDE er sant:
  1. flighthub2_webhook_config.safesky_forward = true   (org-nivå tillatelse)
  2. Det finnes active_flights-rad der:
        drone_id matcher FH2-posisjonens sn → drone
        AND publish_mode = 'live_uav'
        AND raden eksisterer (= flyging pågår)
```

Når flygingen avsluttes (active_flights-rad slettes), stopper delingen automatisk for den drona, selv om webhooken fortsatt mottar posisjoner fra FH2.

## Endringer

### 1. Edge function: `flighthub2-airspace-webhook`

I delen som videresender til SafeSky (rundt linje 322–355):

- Etter `droneIdBySn`-mapping, hent én gang per request alle aktive `live_uav`-flyginger for selskapet:
  ```ts
  const { data: liveFlights } = await supabase
    .from('active_flights')
    .select('drone_id')
    .eq('company_id', companyId)
    .eq('publish_mode', 'live_uav')
    .not('drone_id', 'is', null);
  const liveDroneIds = new Set((liveFlights ?? []).map(f => f.drone_id));
  ```
- I forwarding-loopen: hopp over posisjoner der `droneIdBySn.get(sn)` ikke er i `liveDroneIds`.
- Innsetting i `flighthub2_positions` og `drone_telemetry` påvirkes ikke — vi lagrer alltid all FH2-data internt; det er kun **utgående SafeSky-deling** som gates.
- Behold eksisterende `if (row.safesky_forward && safeskyKey)` som master-gate.

### 2. UI i `StartFlightDialog.tsx` (live-blokken)

- Når `fh2LiveEnabled` er true (begge org-toggles på), vis ekstra info under live-blokken: *"Drona deles til SafeSky så lenge denne flygingen er aktiv. Stopp deling ved å avslutte flyging."*
- Når org-toggle `safesky_forward = false`: vis info-tekst *"Live-modus brukes til intern sporing — selskapet deler ikke til SafeSky."* (knappen virker fortsatt for intern visning).

### 3. UI i "Mitt selskap" → FH2-webhook-seksjonen

Oppdater hjelpeteksten ved `safesky_forward`-togglen til å reflektere ny semantikk:

> "Tillat at FH2-posisjoner deles til SafeSky. Faktisk deling skjer per drone kun når en pilot starter en flyging i 'Live posisjon'-modus."

### 4. UI i `flighthub2-airspace-webhook` test-fixturer (hvis noen)

Sjekk at eksisterende tester ikke forutsetter ubetinget forwarding. Hvis det finnes test som verifiserer SafeSky-kall, oppdater den til å sette opp en active_flight først.

## Sideeffekter / kompatibilitet

- **Eksisterende FH2-kunder med `safesky_forward = true` i dag**: vil oppleve at SafeSky-deling stopper helt før de starter sin første "Live"-flyging i Avisafe. Bør kommuniseres som en endring i release-notater. Eventuelt vise en éngangs-banner i "Mitt selskap" første gang etter utrulling.
- **DroneTag-flyt**: ikke berørt. DroneTag-baserte live-flyginger har sin egen mekanisme (allerede ikke-publiserende per kode-kommentaren *"publishLiveUav removed"*) — men her er ingen endring nødvendig.
- **`flighthub2_positions`-lagring**: uendret. Vi har fortsatt full historikk uavhengig av per-flight-toggle.
- **Flere droner samtidig**: hver dronens deling gates uavhengig (per drone_id).

## Indikator-oppdatering (bonus, lite)

Den røde/grønne indikatoren vi nettopp la inn forblir lik (sjekker bare om vi mottar posisjon i det hele tatt). Vurder en sekundær linje: *"✓ Deles til SafeSky"* eller *"○ Lagres internt — ikke delt"* basert på `fh2LiveEnabled`. Kan legges til samme sted senere.

## Tekniske detaljer

- Ekstra DB-spørring per webhook-kall: `select drone_id from active_flights where company_id = ... and publish_mode='live_uav'` — bør ha index på `(company_id, publish_mode)` om det ikke finnes. Sjekk via supabase--linter etterpå.
- Webhook gjør allerede én kall til `drones`-tabellen per request for SN→drone_id; den nye kallen til `active_flights` legger på ~10ms ekstra. Akseptabelt for ~1Hz innkommende rate.

## Verifisering

1. Sett opp testselskap med `safesky_forward = true`, en drone med matching SN.
2. Send FH2-posisjon via curl uten aktiv flyging → bekreft i logg at SafeSky-kall ikke skjer (men `flighthub2_positions` får rad).
3. Start "Live"-flyging på samme drone i Avisafe → send ny posisjon → bekreft SafeSky-POST i logg.
4. Avslutt flygingen → send ny posisjon → bekreft SafeSky-deling stopper igjen.
