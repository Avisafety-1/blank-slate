

## Fiks FlightHub 2 401 -- Prøv begge regioner automatisk + token-verifisering

### Analyse

Loggene viser at DJI returnerer `200401 Unauthorized` for begge API-varianter mot `es-flight-api-us.djigate.com`. JWT-tokenet er gyldig og ikke utløpt. 

**Mest sannsynlig årsak: Feil region.** Organisasjonen din kan være registrert på Kina-serveren (`es-flight-api-cn.djigate.com`), ikke US-serveren. DJI har separate databaser per region -- et token fra én region fungerer IKKE på den andre.

Det kan også være at tokenet som er lagret i databasen er forskjellig fra det du ser i jwt.io (f.eks. kuttet av, ekstra tegn).

### Plan

**Edge function (`flighthub2-proxy/index.ts`)**:

1. **Test-connection: Prøv begge regioner automatisk**
   - Hvis den konfigurerte base URL-en returnerer 401 på list-projects, prøv automatisk den ANDRE regionen
   - Rapporter hvilken region som fungerte (eller at begge feilet)
   - Vis dette i test-resultatet: "Prøvde US: 401, Prøvde CN: OK" eller "Begge regioner feilet"

2. **Logg token-fingeravtrykk**
   - Logg token-lengde og første 10 + siste 6 tegn (nok til å verifisere mot jwt.io uten å eksponere hele tokenet)
   - Logg organization_uuid fra JWT-payload

```text
Konkret flyt i test-connection:
1. system_status mot konfigurert URL (verifiser at serveren svarer)
2. list-projects mot konfigurert URL (begge API-varianter)
3. Hvis begge 401 → prøv den ANDRE regionen:
   - Konfigurert US → prøv CN
   - Konfigurert CN → prøv US
4. Returner resultat med info om hvilken region som fungerte
```

**Admin UI (`ChildCompaniesSection.tsx`)**:
- Vis i testresultatet hvis en annen region fungerte: "Tokenet fungerer på CN-serveren, ikke US. Oppdater base URL."
- Tilby automatisk URL-bytte hvis alternativ region fungerer

### Filer som endres
1. `supabase/functions/flighthub2-proxy/index.ts` -- region-fallback i test-connection, token-fingeravtrykk
2. `src/components/admin/ChildCompaniesSection.tsx` -- vis region-diagnostikk og tilby auto-bytte

