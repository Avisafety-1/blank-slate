## Situasjon

Consent-siden finnes allerede (`src/pages/OAuthConsent.tsx`) og er rutet på `/.lovable/oauth/consent` i `src/App.tsx`. Men i Supabase OAuth Server-innstillingene (skjermbilde) er **Authorization Path** satt til `/oauth/consent`. Supabase vil dermed redirecte brukere til `https://app.avisafe.no/oauth/consent`, som i dag ikke finnes → 404/NotFound.

## Løsning

Registrer samme `OAuthConsent`-komponent også på `/oauth/consent` i `src/App.tsx`, slik at Supabases konfigurerte sti fungerer. Behold den eksisterende `/.lovable/oauth/consent`-ruten som alias for bakoverkompatibilitet.

### Endring

**`src/App.tsx`** — legg til én linje ved siden av den eksisterende consent-ruten:

```tsx
<Route path="/oauth/consent" element={<OAuthConsent />} />
<Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
```

Ingen endringer i selve `OAuthConsent.tsx`, MCP-server, Supabase-innstillinger eller migrasjoner. Consent-komponenten håndterer allerede innlogging via `?next=`, henting av autorisasjonsdetaljer, og godkjenn/avvis-flyten.

## Verifisering

- Åpne `https://app.avisafe.no/oauth/consent?authorization_id=...` fra en MCP-klient → consent-siden vises i stedet for 404.
- Godkjenn → redirect tilbake til klienten fullføres.
- Gammel `/.lovable/oauth/consent`-URL virker fortsatt.
