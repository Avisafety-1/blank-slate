

## Flytt FlightHub 2-token til Supabase Vault

### Bakgrunn

Tokenet lagres i dag som klartekst i `companies.flighthub2_token`. Prosjektet bruker allerede Vault + pgcrypto for ECCAIRS-hemmeligheter -- vi følger samme mønster med pgp-kryptering.

### Tilnærming

Bruk `pgp_sym_encrypt`/`pgp_sym_decrypt` med en Vault-nøkkel (`FH2_ENCRYPTION_KEY`), lagre kryptert token i en ny dedikert tabell. Alle i samme selskap refererer til selskapets krypterte rad.

### Plan

**1. Vault-hemmelighet**
- Legg til `FH2_ENCRYPTION_KEY` i Supabase Vault (via SQL-migrasjon: `INSERT INTO vault.secrets (name, secret) VALUES ('FH2_ENCRYPTION_KEY', gen_random_uuid()::text)`)

**2. DB-migrasjon**
- Opprett tabell `company_fh2_credentials`:
  ```sql
  CREATE TABLE public.company_fh2_credentials (
    company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    token_encrypted TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );
  ```
- RLS: kun administratorer i eget selskap kan lese/skrive
- Opprett `SECURITY DEFINER`-funksjoner:
  - `save_fh2_token(p_company_id UUID, p_token TEXT)` -- krypterer og upsert-er
  - `get_fh2_token(p_company_id UUID) RETURNS TEXT` -- dekrypterer og returnerer klartekst (kun callable fra edge functions via service role)
- Migrer eksisterende tokens: `INSERT INTO company_fh2_credentials SELECT id, pgp_sym_encrypt(flighthub2_token, key) FROM companies WHERE flighthub2_token IS NOT NULL`
- Sett `flighthub2_token = NULL` på migrerte selskaper

**3. Edge function (`flighthub2-proxy/index.ts`)**
- Erstatt `SELECT flighthub2_token FROM companies` med kall til `get_fh2_token(company_id)` via `supabase.rpc()`
- Behold parent-fallback: prøv eget selskap først, deretter morselskap

**4. Admin UI (`ChildCompaniesSection.tsx`)**
- `handleSaveFh2`: kall `supabase.rpc('save_fh2_token', { p_company_id, p_token })` i stedet for direkte update
- Fjern lesing av `flighthub2_token` fra companies-select (bruk en boolean-sjekk i stedet)
- Token vises aldri i UI etter lagring (kun `●●●●●●●●` med mulighet for å skrive inn nytt)

**5. Kartvisning (`Kart.tsx`)**
- Erstatt `SELECT flighthub2_token` med `SELECT 1 FROM company_fh2_credentials WHERE company_id = X` for å sjekke om FH2 er konfigurert (trenger ikke selve tokenet)

### Sikkerhet
- Klartekst-token eksisterer kun inne i `SECURITY DEFINER`-funksjoner (kjører med eierens privilegier)
- Frontend ser aldri tokenet etter lagring
- Krypteringsnøkkelen ligger i Vault, utilgjengelig for klienter
- Hvert selskap har sin egen rad -- ingen lekkasje mellom selskaper

### Filer som endres
1. SQL-migrasjon (ny tabell, vault-nøkkel, 2 funksjoner, datamigrering)
2. `supabase/functions/flighthub2-proxy/index.ts`
3. `src/components/admin/ChildCompaniesSection.tsx`
4. `src/pages/Kart.tsx`

