## Problem
Lenken `/tl/miljo-og-klima/verneomrader/dispensasjoner/` finnes ikke. To feil:
1. Slugen `tl` er feil — Statsforvalteren i Trøndelag bruker `trondelag`. Mappingen min brukte korte koder som ikke gjelder for nettsiden.
2. Stien `/dispensasjoner/` finnes ikke som standard underside. Hver Statsforvalter har egen URL-struktur for søknadsskjemaer.

## Faktisk søknadsprosess
Etter undersøkelse av Statsforvalteren-sidene:
- Det finnes **ingen nasjonalt felles elektronisk dispensasjonsskjema** for verneområder.
- Søknad sendes via **Sikker melding** (`https://www.statsforvalteren.no/melding`), e-post eller brevpost til riktig embete.
- Hvert embete har en **verneområde-side** (`/<slug>/miljo-og-klima/verneomrader/`) med kontaktinfo og praktisk veiledning. Noen (Nordland, Troms og Finnmark) har egne droneunderssider.
- For nasjonalpark-/verneområdestyrer går søknad via styrets nettside på `nasjonalparkstyre.no/<Områdenavn>/soknader/droner` eller hovedside.

## Endring (kun frontend, én fil: `src/lib/natureProtectionRules.ts`)

1. **Rett opp STATSFORVALTER_SLUGS** til faktiske URL-slugger:
   - `oslo-og-viken`, `innlandet`, `vestfold-og-telemark`, `agder`, `rogaland`, `vestland`, `more-og-romsdal`, `trondelag`, `nordland`, `troms-finnmark`, `ostfold-buskerud-oslo-og-akershus`.

2. **Endre dispensasjonssti** til `/<slug>/miljo-og-klima/verneomrader/` (stabil side med kontaktinfo og veiledning, ikke en spesifikk dispensasjonsside som kan flyttes).

3. **Legg til Sikker melding-lenke** som tilleggsknapp i popup (`https://www.statsforvalteren.no/melding`) når myndighet er Statsforvalter — det er der man faktisk sender søknaden.

4. **Forbedre verneområdestyre-strategi**: lenk til hovedsiden `nasjonalparkstyre.no` med søkeparameter når slug ikke kan utledes trygt, ellers behold slug-bygging. Vi prøver ikke å gjette `/soknader/droner`-stien siden capitalization varierer.

5. **Endre knappetekst** fra «Søk dispensasjon hos X» til «Veiledning hos X» når lenken peker til veilednings-/oversiktsside, og behold «Søk dispensasjon» kun når URL faktisk er et søknadsskjema. Sikker melding-knappen får tekst «Send søknad via sikker melding».

## Påvirkede filer
- `src/lib/natureProtectionRules.ts` — slug-mapping, ny `sikkerMeldingUrl` på enrichment-objektet.
- `src/lib/mapDataFetchers.ts` — legg til ekstra knapp for Sikker melding når feltet er satt.

## Verifisering
- Gaulosen marint verneområde (forvaltet av Statsforvalteren i Trøndelag) skal nå gi `https://www.statsforvalteren.no/trondelag/miljo-og-klima/verneomrader/` + Sikker melding-knapp.
- Område forvaltet av Statsforvalteren i Rogaland gir `/rogaland/miljo-og-klima/verneomrader/`.
- Kommunalt forvaltet område: åpner Naturbase-faktaark (uendret).
