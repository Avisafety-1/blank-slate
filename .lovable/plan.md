## Plan: Trygg JWT-nøkkelrotasjon for ChatGPT/Claude-innlogging

### Bakgrunn
Supabase Auth-prosjektet bruker i dag HS256 (symmetrisk signering). Dette er årsaken til at ChatGPT/Claude får feilen `HS256 is not supported for ID token signing` når de prøver å bytte autorisasjonskode til et token. For at OAuth 2.1/OIDC-integrasjonen (MCP-serveren) skal fungere, må vi migrere til RS256 eller ES256 (asymmetrisk signering).

### Mål
- Aktivere asymmetrisk JWT-signering (RS256/ES256) i Supabase Auth.
- Sørge for at eksisterende brukere ikke blir kastet ut.
- Sikre at MCP-serveren, Edge Functions og alle app-funksjoner fortsetter å fungere.

----

### Steg 1: Forhåndsrevisjon av JWT-konsumenter
1.1. **MCP-server (`supabase/functions/mcp/index.ts`)**
- Bruker `@lovable.dev/mcp-js@0.20.0` med `auth.oauth.issuer({ issuer: "https://pmucsvrypogtttrajqxq.supabase.co/auth/v1", acceptedAudiences: "authenticated" })`.
- Biblioteket henter discovery-dokument og JWKS fra issuer. Dette skal fungere med RS256/ES256.
- **Aksjon:** Bekreft med Lovable/support at mcp-js 0.20.0 støtter asymmetrisk signering og at det ikke er en kjent bug.

1.2. **Edge Functions med egen JWT-validering**
- `supabase/functions/_shared/auth.ts` bruker `client.auth.getUser(token)` — server-side validering, ikke avhengig av algoritme i klientkoden.
- Ingen annen kode i repoet gjør manuell JWT-signaturkontroll eller bruker JWKS-endepunkter direkte.

1.3. **Edge Functions med `verify_jwt = true`**
- Følgende funksjoner har JWT-verifikasjon aktivert i Supabase-infrastrukturen:
  - `push-subscribe`, `ai-risk-assessment`, `ai-search`, `drone-regulations-ai`, `marketing-ai`, `marketing-visual`, `process-manual`, `generate-course`, `generate-narration`, `suggest-course-topics`.
- Disse håndteres av Supabase Edge Functions runtime og skal fungere automatisk etter rotasjon.

1.4. **Eksterne integrasjoner**
- Sjekk om DroneTag, SafeSky, FlightHub 2, ECCAIRS, LinkedIn, Meta, Resend, Stripe, Ninox, OpenAIP, CAA, BarentsWatch eller andre tredjeparter validerer AviSafe-tokens eller mottar dem på webhooks.
- **Aksjon:** Gå gjennom dokumentasjon for hver integrasjon som mottar AviSafe-utstedte tokens (hvis noen). De fleste bruker egne tokens, ikke AviSafe JWT.

----

### Steg 2: Forberedelse og test
2.1. **Sett opp tidsvindu med lav trafikk**
- Planlegg rotasjon utenfor arbeidstid (f.eks. kveld/helg) for å redusere påvirkning.

2.2. **Sikkerhetskopier nøkkelinfo**
- Noter nåværende signeringsnøkkel (ikke selve hemmeligheten) og prosjekt-ID for referanse.

2.3. **Forhåndstest av MCP-server**
- Kjør `app_mcp_server--extract_mcp_manifest` for å verifisere at MCP-entry fortsatt bygger.
- Kjør en test-forespørsel mot `mcp`-funksjonen med en gyldig token for å etablere baseline.

2.4. **Varsling**
- Informer eventuelle superadmin-brukere og kundestøtte om planlagt vedlikehold.

----

### Steg 3: Gjennomføre nøkkelrotasjon i Supabase Dashboard
3.1. Åpne Supabase Dashboard → Project Settings → Auth → JWT Settings / Signing Keys.

3.2. Velg **Generate new asymmetric key** (RS256 anbefales for best kompatibilitet, ES256 er også OK).

3.3. Sett den nye nøkkelen som **active**.

3.4. **Behold den gamle HS256-nøkkelen som standby/secondary** i en overgangsperiode (minimum 24–48 timer). Dette sørger for at eksisterende access tokens og refresh tokens fortsatt valideres.

3.5. Lagre endringen. Supabase begynner å signere nye tokens med den nye asymmetriske nøkkelen.

----

### Steg 4: Verifikasjon umiddelbart etter rotasjon
4.1. **Basisinnlogging i appen**
- Logg inn på `app.avisafe.no` med bruker/passord og Google.
- Bekreft at `supabase.auth.getSession()` og `getUser()` returnerer gyldig sesjon.

4.2. **MCP / ChatGPT-integrasjon**
- Fra ChatGPT/Claude: klikk "Koble til AviSafe" og godkjenn på consent-siden.
- Bekreft at token-utvekslingen (`POST /auth/v1/oauth/token`) nå returnerer 200 og ikke `HS256 is not supported...`.
- Kjør en test-forespørsel mot `mcp`-funksjonen og verifiser at token-validering fungerer.

4.3. **Edge Functions med `verify_jwt = true`**
- Kjør test-forespørsler mot `ai-search`, `ai-risk-assessment`, `generate-course` og `push-subscribe`.
- Bekreft 200-respons og ikke 401.

4.4. **Edge Functions med egen validering**
- Kjør funksjoner som bruker `supabase/functions/_shared/auth.ts` (f.eks. `process-manual`, `marketing-ai`) og bekreft at `getUser()` fungerer.

4.5. **Loggovervåking**
- Sjekk `auth_logs` for feil etter `POST /oauth/token`, `GET /user`, `POST /token`.
- Sjekk `function_edge_logs` for `mcp`, `ai-search`, `ai-risk-assessment` og andre aktive funksjoner.

----

### Steg 5: Opprydning og overvåking
5.1. **Overgangsperiode (24–48 timer)**
- Overvåk analytics, auth logs og support-henvendelser for innloggingsfeil.
- Hvis alt fungerer, fjern gammel HS256-nøkkel fra standby.

5.2. **Hvis MCP-biblioteket har problemer**
- Oppdater `@lovable.dev/mcp-js` til nyeste versjon hvis nødvendig.
- Eventuelt rull tilbake til HS256 inntil biblioteket eller Supabase Auth støtter kombinasjonen fullt ut.

----

### Steg 6: Rollback-plan
- Hvis innloggingsfeil oppstår eller MCP slutter å fungere:
  1. Gå tilbake til Supabase Dashboard → JWT Settings.
  2. Sett den gamle HS256-nøkkelen som active igjen.
  3. Verifiser at appen og MCP fungerer som før.
  4. Kontakt Lovable/Supabase-support før ny forsøk.

----

### Hva som vil slutte å fungere (kort svar)
Ingenting skal slutte å fungere hvis rotasjonen gjøres med en overgangsperiode. Den eneste komponenten som har teoretisk risiko er MCP-serveren (`mcp`-funksjonen) fordi `@lovable.dev/mcp-js` må stole på issuerens nye JWKS/asymmetriske nøkkel. Alle andre deler av appen bruker standard Supabase Auth-validering som er algoritme-uavhengig.

----

### Filer/endepunkter som berøres
- Supabase Dashboard: Auth → JWT Settings
- `supabase/functions/mcp/index.ts` (runtime-validering av OAuth-tokens)
- `supabase/functions/_shared/auth.ts` (uendret, men verifiseres)
- Edge Functions med `verify_jwt = true` i `supabase/config.toml`