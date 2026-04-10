
Mål: rette FH2-enhetshenting for Tensio ved å gjøre den enkel og korrekt mot DJI sitt dokumenterte endpoint: `GET /openapi/v0.1/device`.

Hva jeg fant
- `test-connection` virker: loggene viser `token_ok: true`, 14 prosjekter og korrekt EU-base-URL.
- Feilen ser ut til å ligge i `list-devices`, ikke i autentisering.
- Nåværende kode antar at hvert element i `data.list` er én flat enhet med felt som `device_sn`, `device_name`, `device_model`.
- DJI-dokumentasjonen du la inn viser at hvert element i stedet ser slik ut:
```text
list[] -> { gateway: {...dock...}, drone: {...aircraft...} }
```
- Resultat: dagens normalisering finner ingen `device_sn`/`device_name` på wrapper-objektet, og UI-et filtrerer derfor bort alt. Derfor blir listen tom selv om enheter finnes.

Plan

1. Forenkle `list-devices` i `supabase/functions/flighthub2-proxy/index.ts`
- Bruke `GET /openapi/v0.1/device` som primærkall for `openapi-v0.1`.
- Sende kun nødvendige headers:
  - `X-User-Token`
  - `X-Request-Id`
  - `X-Language`
- Ikke basere hovedflyten på prosjekt-endepunkter for å hente org-enheter.

2. Flate ut DJI-responsen riktig
- Lage en liten flatten-funksjon som gjør:
  - hvis et listeelement har `gateway`, legg til gateway som egen enhet
  - hvis et listeelement har `drone`, legg til drone som egen enhet
  - hvis et listeelement allerede er flatt, behold det
- Beholde relevante metadata som:
  - `device_sn`
  - `callsign` / navn
  - `device_model`
  - `device_online_status`
  - `mode_code`
  - `camera_list`
  - type/class (`drone` / `airport` / dock)

3. Normalisere felt til Avisafe-format
- Mappe DJI-felter til feltene UI-et bruker:
  - `sn` -> `device_sn`
  - `callsign` -> `device_name`
  - `device_model.name` -> modellnavn
  - `device_online_status` -> `online_status`
  - `device_model.class` -> typegrunnlag
- Oppdatere type-deteksjon slik at dock/gateway og drone vises riktig.

4. Gjøre UI-et mer robust i `src/components/admin/FH2DevicesSection.tsx`
- Støtte både:
  - allerede flatede enheter fra edge function
  - eventuelle nested objekter som ekstra fallback
- Justere navn/modell/type slik at DJI sine faktiske feltnavn (`callsign`, `device_model.name`, `device_online_status`) alltid vises.
- Beholde deduplisering på serienummer.

5. Beholde fallback kun som reserve
- Hvis org-kallet returnerer ekte tom liste, kan eksisterende prosjekt-fallback beholdes som sekundær strategi.
- Men hovedlogikken skal være org-endepunktet, siden det er dette DJI dokumenterer for “all devices under organization”.

Tekniske detaljer
- Filer:
  - `supabase/functions/flighthub2-proxy/index.ts`
  - `src/components/admin/FH2DevicesSection.tsx`
- Ingen databaseendringer trengs.
- Mest sannsynlig rotårsak er denne mismatchen:
```text
Forventet i koden: list[] = { device_sn, device_name, ... }
Faktisk fra DJI:   list[] = { gateway: {...}, drone: {...} }
```

Verifisering etter implementasjon
1. Kjør `Test tilkobling` og bekreft fortsatt grønn status.
2. Trykk `Hent enheter`.
3. Bekreft at Tensio sine docker og droner vises i listen.
4. Åpne en enhet og sjekk at detaljdialog fortsatt virker.
5. Hvis org-endepunktet returnerer kun dock på noen installasjoner, bekrefte at både `gateway` og `drone` håndteres uten å miste data.

Forventet resultat
- Tensio-enhetene dukker opp i Avisafe.
- Listen henter fra riktig DJI-endepunkt på en enklere og mer korrekt måte.
- Koden blir mindre “smart”, men mer kompatibel med FH2 OpenAPI V1.0 slik DJI dokumenterer den.
