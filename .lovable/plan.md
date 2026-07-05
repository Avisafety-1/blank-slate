## Mål
Gjøre OAuth-consent-siden (`/oauth/consent`) ferdig med AviSafe-branding, tydelig feilhåndtering og detaljert tilgangsinformasjon slik at brukeren føler seg trygg før de godkjenner en agent/MCP-klient.

## Endringer

### 1. Visuell profil — AviSafe-branded
- Bytt ut den nøytrale grå bakgrunnen med appens mørk bakgrunn (`bg-background`) og glassmorphism-kort (`GlassCard`-stil).
- Legg til AviSafe-logo/brand-mark øverst i kortet.
- Bruk appens typografi (`font-display` / `font-sans`) og semantiske farger (`primary`, `muted`, `destructive` for Avvis).
- Knappegruppe: `Godkjenn` som primærknapp, `Avvis` som outline/secondary-knapp.

### 2. Tilstander og feilhåndtering
- **Normal consent (med `authorization_id`):** viser klientnavn, beskrivelse og detaljert tilgang.
- **Mangler/ugyldig `authorization_id`:** viser en vennlig melding om at lenken er ugyldig eller utløpt, med en knapp tilbake til appen (`/`).
- **Ikke innlogget:** beholder eksisterende redirect til `/auth?next=...`, men forbedrer UX-tekstene så brukeren skjønner hva som skjer.
- **Godkjenning/avvisning feiler:** viser tydelig feilmelding og lar brukeren prøve igjen.

### 3. Detaljert tilgangsinformasjon
- Utvid consent-kortet med en liste over hvilke data/verktøy klienten får tilgang til:
  - Oppdrag (liste + detaljer)
  - Hendelser
  - Droner
- Hver rettighet vises med ikon og kort tekst, f.eks.:
  - "Lese oppdrag du har tilgang til"
  - "Lese hendelser i ditt selskap"
  - "Lese droner i din flåte"
- Tekst: "Klienten får aldri tilgang til å endre data eller se informasjon utenfor det du ellers har lov til å se i AviSafe."

### 4. Tekst og språk
- Norsk som hovedspråk (bokmål).
- Tydelige CTA-er: "Koble {klient} til AviSafe", "Godkjenn tilgang", "Avvis tilgang".
- Legg til hjelpetekst om hva brukeren kan gjøre hvis de ombestemmer seg (går til Innstillinger / Admin for å administrere tilkoblede apper).

### 5. Filendringer
- **Kun** `src/pages/OAuthConsent.tsx` endres.
- Ingen endringer i `src/App.tsx`, MCP-server, Supabase-innstillinger eller migrasjoner.
- Etter endringen må MCP-manifestet og `mcp`-Edge-funksjonen **ikke** deployes på nytt, siden consent-siden er rent frontend og påvirker ikke MCP-verktøyene. Bygg/test kjøres for å verifisere TypeScript.

## Verifisering
- Åpne `/oauth/consent` uten `authorization_id` → vennlig "ugyldig eller utløpt lenke"-melding.
- Åpne `/oauth/consent?authorization_id=...` (gyldig) → branded consent-kort med klientnavn og tilgangsliste.
- Klikke "Avvis" → redirect tilbake til klienten med avslag.
- Bygget passerer uten TypeScript-feil.