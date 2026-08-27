# Enkel direktetest mot SafeSky public API med den nye nøkkelen

## Hvorfor vi ikke bare kan «curle» det herfra

Den nye nøkkelen er lagret som en hemmelighet (`SAFESKY_BEACONS_PROD_API_KEY`) som kun kan leses av edge-funksjoner. Verdien er ikke tilgjengelig for meg i klartekst, så testkallet må gjøres fra en edge-funksjon. Dagens `safesky-env-compare` er en full diagnosefunksjon med superadmin-vakt — det er den vakten som ga 401, ikke SafeSky.

## Den enkle testen

Lag en liten engangsfunksjon `safesky-beacons-prodtest` som gjør nøyaktig ett kall:

```
GET https://public-api.safesky.app/v1/beacons/?viewport=47.0,5.0,72.0,32.0
Header: x-api-key: <SAFESKY_BEACONS_PROD_API_KEY>
```

Den returnerer bare:

- HTTP-status
- antall beacons i svaret
- de første ~300 tegnene av svaret ved feil

Ingen superadmin-vakt (funksjonen leser ingen data og kan ikke skrive noe), ingen databasekall, ingen HMAC — kun `x-api-key`, slik SafeSky sitt eget eksempel viser.

Valgfritt i samme kall, hvis du vil: en variant uten skråstrek (`/v1/beacons`) som kontroll, slik at vi ser om stien er årsaken til tidligere avvisninger.

## Etterpå

- Virker nøkkelen: vi lager en egen plan for å bytte `safesky-beacons-fetch` fra sandkasse til produksjon.
- Feiler den: vi har status og feilmelding å sende tilbake til SafeSky.
- Testfunksjonen slettes når vi er ferdige, så den ikke blir liggende åpen.

## Teknisk

- Ny fil `supabase/functions/safesky-beacons-prodtest/index.ts`, ca. 40 linjer.
- Bruker `safeFetch` fra `_shared/http.ts` med allowlist `public-api.safesky.app`.
- Ingen endring i `safesky-env-compare`, `safesky-beacons-fetch`, kartet eller databasen.
