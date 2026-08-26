# SafeSky: verifiser prod-nøkkel mot /v1/beacons/ (med skråstrek)

## Hva vi allerede har testet
Diagnosefunksjonen `safesky-env-compare` kaller i dag:

```
https://public-api.safesky.app/v1/beacons?viewport=...&return_grounded_traffic=true
```

altså **uten** skråstrek etter `beacons`, og med ekstra query-parameter. Prod-svarene vi fikk i den runden var avvisninger (401/500 «access denied»), mens sandkassen svarte normalt.

Tanguy sitt eksempel bruker en litt annen form:

```
curl --header 'x-api-key:<key>' 'https://public-api.safesky.app/v1/beacons/?viewport=43.1035,-2.0821,47.9943,15.3216'
```

— med skråstrek og uten `return_grounded_traffic`. Det er derfor **ikke** verifisert at prod-nøkkelen feiler; avvisningen kan skyldes redirect/rutingsforskjell på stien.

## Foreslått test (kun diagnose, ingen endring i appen)
1. Utvid `safesky-env-compare` med valgfrie flagg:
   - `trailingSlash=true` → bruker `/v1/beacons/`
   - `plain=true` → dropper `return_grounded_traffic`
   - `redirect: "manual"` slik at vi ser om vi får 301/307 og hvor den peker.
2. Kjør fire enkeltkall (ett HTTP-kall hver, ingen databaseskriving):
   - prod-nøkkel + `/v1/beacons/` + kun `viewport` (Tanguys eksakte form, hans viewport)
   - prod-nøkkel + `/v1/beacons/` + vårt Nord-Europa-viewport `47.0,5.0,72.0,32.0`
   - prod-nøkkel + `/v1/beacons` (uten skråstrek) som kontroll
   - sandkasse-nøkkel + samme sti som kontroll
3. Rapporter statuskode, eventuelle redirect-headere, antall beacons og kilder/typer.

## Beslutningspunkt etterpå
- Fungerer prod med skråstrek → planlegg overgang fra sandkasse til prod for `safesky-beacons-fetch` og `safesky-cron-refresh` (volum og oppdateringsfrekvens er høyere i prod).
- Feiler den fortsatt → send status/feilmelding tilbake til Tanguy som dokumentasjon.

## Teknisk
- Kun `supabase/functions/safesky-env-compare/index.ts` endres; den er isolert og kalles ikke fra appen.
- Ingen databasekall, ingen endring i dagens trafikkbilde i Avisafe.
- Én GET per variant for å unngå rate limit.
