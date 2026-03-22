

## Plan: Fiks at avdelinger ser morselskapets droner/utstyr

### Rotårsak
Forrige endring la til `parent_company_id` i `get_user_visible_company_ids()` slik at avdelinger kunne lese morselskapets SORA-config. Men denne funksjonen brukes også i RLS for `drones`, `equipment`, og andre tabeller — så nå ser avdelingsbrukere morselskapets droner og utstyr.

### Løsning
1. **Fjern parent fra `get_user_visible_company_ids()`** — tilbakestill til kun eget selskap + barn (for admins). Denne funksjonen brukes bredt for ressursisolasjon.
2. **Lag en ny funksjon `get_user_readable_company_ids()`** som inkluderer parent. Bruk denne kun for tabeller der arv er ønsket (f.eks. `company_sora_config`).
3. **Oppdater `company_sora_config` RLS** til å bruke den nye funksjonen.

### Steg 1: SQL-migrasjon

```sql
-- Ny funksjon som inkluderer parent (for lesing av delt config)
CREATE OR REPLACE FUNCTION get_user_readable_company_ids(_user_id uuid)
RETURNS uuid[] ...
-- Samme som nåværende get_user_visible_company_ids (med parent)

-- Tilbakestill get_user_visible_company_ids UTEN parent
CREATE OR REPLACE FUNCTION get_user_visible_company_ids(_user_id uuid)
RETURNS uuid[] ...
-- Kun eget selskap + barn (for admins)

-- Oppdater SORA config RLS til å bruke ny funksjon
DROP POLICY "Users can read own company config" ON company_sora_config;
CREATE POLICY "Users can read own and parent company config"
  ON company_sora_config FOR SELECT TO authenticated
  USING (company_id = ANY(get_user_readable_company_ids(auth.uid())));
```

### Steg 2: Sjekk andre tabeller som trenger parent-tilgang
Kun `company_sora_config` trenger parent-lesing. Andre tabeller (drones, equipment, profiles, etc.) skal forbli isolert til eget selskap + barn.

### Filer
- SQL-migrasjon (ny funksjon + tilbakestill gammel + oppdater SORA RLS)
- Ingen kodeendringer nødvendig

