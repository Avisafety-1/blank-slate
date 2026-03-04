

## Svar: Permanent, ikke engangs

`skipWaiting()` og `clients.claim()` blir en **permanent** del av Service Worker-en — ikke en engangsgreie. Det betyr:

- **Hver gang** du deployer en ny versjon av appen, vil den nye SW-en aktiveres umiddelbart for alle brukere neste gang de åpner/navigerer til appen.
- Det påvirker **ikke** innlogging, registrering eller annen funksjonalitet. Det er kun SW-livssyklusen som endres: nye versjoner venter ikke lenger på at brukeren lukker alle tabs.
- Cache-slettingen i `activate` sikrer at gamle filer ikke henger igjen.

**Dette er ønsket oppførsel fremover** — det betyr at du aldri igjen trenger å bekymre deg for brukere som sitter fast på gammel cache. Hver deploy → neste besøk → automatisk oppdatering.

Skal jeg implementere dette?

