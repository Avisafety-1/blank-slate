# Bedre feilmeldinger ved DJI Cloud-innlogging (revidert)

## Hva faktiske API-svar viser

Jeg har sjekket både DroneLog-API-dokumentasjonen (`docs/dronelog-api-reference.md`) og reelle feil lagret i `pending_dji_logs`:

| Status | Faktisk svar fra DroneLog | Hva det egentlig betyr |
|---|---|---|
| **429** | `{"statusCode":429,"message":"Too many requests"}` (bekreftet i DB, 4 forekomster) | DroneLog/DJI struper innlogging — for mange forsøk |
| **401** | "Ikke autorisert (manglende/ugyldig token)" (per docs) | **Vår** DroneLog-API-nøkkel er ugyldig — IKKE brukerens passord |
| **400** | `{"message": "..."}` med detaljer | Vanligvis feil DJI-e-post/passord (DroneLog videresender DJI sin feilmelding her) |
| **500** | `{"message":"Dronelog processing failed."}` (bekreftet under prosessering) | DroneLog/DJI serverfeil |
| 403 | Ikke dokumentert, ikke sett | — |

Viktig korreksjon: Dagens kode mapper 401/403 til "Ugyldig DroneLog API-nøkkel". Det er **riktig for 401** (per docs), men det betyr at brukerens feil passord trolig kommer som **400** (eller en 500 med `message`-felt) — ikke som 401.

## Klassifisering (server) — `dji-login` i `supabase/functions/process-dronelog/index.ts`

Returner alltid `{ error, reason, upstreamStatus, retryAfter?, details }` med `reason` ∈:

| `reason` | Trigger |
|---|---|
| `rate_limited` | `res.status === 429` (forventet, bekreftet format) |
| `api_key_invalid` | `res.status === 401` (per docs — vår nøkkel) |
| `invalid_credentials` | `res.status === 400` **eller** (`res.status === 500` og upstream `message` matcher `/(invalid|incorrect|wrong|password|email|account|credential|login)/i`) |
| `account_locked` | upstream `message` matcher `/(locked|blocked|captcha|verification|suspended)/i` (uansett status) |
| `upstream_error` | resterende 5xx |
| `unknown` | alt annet |

Kontroller `account_locked`-regelen *før* `invalid_credentials` / `upstream_error`.

Logge eksakt upstream-status og første 200 tegn av `data.message` (uten passord) for hver feilklassifisering, så vi kan justere reglene videre når vi får reelle 400-eksempler.

## Klassifisering (klient) — `src/components/UploadDroneLogDialog.tsx`

- Utvid `callDronelogAction` til å videresende `reason` på error-objektet.
- Ny `getDjiLoginErrorMessage(error)`:

| `reason` | Toast |
|---|---|
| `invalid_credentials` | "Feil DJI-e-post eller passord. Sjekk og prøv igjen." (error) |
| `rate_limited` | "For mange innloggingsforsøk mot DJI. Vent **N sekunder** og prøv igjen." (warning, 8 s) der `N = retryAfter ?? 60` |
| `account_locked` | "DJI har midlertidig låst kontoen pga. sikkerhet. Logg inn i DJI-appen først, og prøv igjen om noen minutter." (error) |
| `api_key_invalid` | "DroneLog API-nøkkelen mangler eller er utløpt. Kontakt administrator." (error) |
| `upstream_error` | "DJI Cloud svarer ikke akkurat nå. Prøv igjen om et par minutter." (warning) |
| fallback | "DJI-innlogging feilet: <melding>" (error) |

Bruk i `handleDjiLogin` (~rad 1100) og `handleDjiAutoLogin` (~rad 452). Ved `rate_limited`: sett `djiLoginCooldown` i `retryAfter` sekunder (i stedet for fast 15 s), med synlig nedtelling på knappen.

For `dji-auto-login`: når `reason === 'invalid_credentials'` → "Lagret DJI-passord ble avvist. Logg inn på nytt." (lagret legitimasjon ryddes som i dag).

## Ikke i scope
- DB- eller schema-endringer.
- Endringer i selve loggopplastingsflyten (parsing, FH2, ArduPilot).
- UI-redesign av login-skjermen — kun toast-tekst og knapp-cooldown.

## Verifisering etter implementasjon
1. Trigge 429 ved å logge inn 3+ ganger raskt → forvent gul toast med sekundernedtelling.
2. Trigge feil passord → forvent rød "Feil DJI-e-post eller passord".
3. Sjekke edge-loggene for `dji-login` for å se hvilken `reason` som blir klassifisert, og justere regex hvis 400-meldinger er annerledes enn antatt.
