
Mest sannsynlig er dette ikke lenger et autentiseringsproblem, men et filformatproblem.

Hva jeg fant:
- `list-projects` fungerer mot EU og returnerer prosjekter, så token, region og `X-Project-Uuid` virker.
- S3/OSS-opplasting fungerer også (`OSS upload status: 200`).
- Feilen oppstår først i `POST /openapi/v0.1/wayline/finish-upload`, som svarer `500 {"code":200500,"message":"server error"}`.
- DJI-dokumentasjonen for `finish-upload` viser bare `name` + `object_key` i body. `drone_model_key` er ikke dokumentert der, så den bør ikke være nødvendig.
- Den nåværende KMZ-generatoren i `FlightHub2SendDialog.tsx` bygger en for enkel og sannsynligvis ugyldig DJI-WPMZ:
  - den skriver `wpmz/waylines.kml` i stedet for `wpmz/waylines.wpml`
  - `template.kml` mangler flere påkrevde DJI-felter som finnes i dokumentasjonen, bl.a. `wpml:templateType`, `wpml:takeOffSecurityHeight`, ofte også payload-relaterte felt for støttede modeller
  - `waylineKml = templateKml` er en klar forenkling som trolig gjør filen ugyldig for FlightHub 2
- Prosjektet har allerede en mye bedre generator i `src/lib/kmzExport.ts` som faktisk lager:
  - `wpmz/template.kml`
  - `wpmz/waylines.wpml`

Konklusjon:
- “Server error” kommer sannsynligvis fordi FlightHub 2 aksepterer at filen er lastet opp til storage, men feiler når den prøver å parse/registrere KMZ-en som en gyldig wayline-fil.

Plan:
1. Erstatt den innebygde KMZ-genereringen i `src/components/FlightHub2SendDialog.tsx` med den eksisterende `generateDJIKMZ` fra `src/lib/kmzExport.ts`.
2. Konverter `Blob`-resultatet til base64 i dialogen, i stedet for å generere ZIP/KML manuelt der.
3. Fjern `drone_model_key` fra `finish-upload`-payloaden i `supabase/functions/flighthub2-proxy/index.ts`, siden DJI-dokumentasjonen for dette endepunktet kun viser `name` og `object_key`.
4. Behold loggingen for `finish-upload`, slik at vi kan se om responsen endrer seg fra 500 til 200 / `code: 0`.
5. Hvis det fortsatt feiler etter korrekt KMZ-format:
   - legg til én ekstra logg som viser hvilken API-variant som brukes for STS + finish-upload
   - sjekk at `openapi/v0.1/project/sts-token` og `finish-upload` bruker samme variant og samme prosjekt-header
   - eventuelt teste om `finish-upload` må kjøres uten ekstra, udokumenterte felter og med ren DJI-eksempelflyt

Filer som endres:
1. `src/components/FlightHub2SendDialog.tsx` — bruk `generateDJIKMZ` i stedet for lokal, forenklet KMZ-bygging
2. `supabase/functions/flighthub2-proxy/index.ts` — fjern `drone_model_key` fra `finish-upload` body, behold diagnostikk

Tekniske detaljer:
```text
Nåværende feilkjede:
JWT OK -> prosjektliste OK -> STS OK -> S3 upload OK -> finish-upload 500

Mest sannsynlig årsak:
finish-upload peker på en objektfil som finnes,
men selve KMZ-innholdet er ikke gyldig DJI WPMZ.

Sterke indikatorer:
- bruker `waylines.kml` i stedet for `waylines.wpml`
- template/wayline-filer er “samme struktur”
- mangler flere DJI-felter som docs viser
- prosjektet har allerede en dedikert generator som lager riktig filnavnstruktur
```
