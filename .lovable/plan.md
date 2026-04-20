

## Plan: Flylogg-varsler skal bruke arvet mottakerliste fra morselskap

### Diagnose
`checkFlightAlerts` i `UploadDroneLogDialog.tsx` (linje 1755–1774) henter `company_flight_alerts` og `company_flight_alert_recipients` kun for avdelingens egen `companyId`. Det finnes ingen fallback til morselskapet og ingen sjekk på `propagate_flight_alerts`. Resultat: når en pilot logger flytur i avdeling B, går varselet kun til mottakere lagret på B — selv om morselskapet har «Gjelder for alle underavdelinger» aktivert.

Dagens propageringskopi i `ChildCompaniesSection` skriver alerts/recipients ned til avdelingene ved lagring, men:
- Endringer på morselskapet etter kopi reflekteres ikke automatisk (ingen runtime-arv).
- RLS hindrer trolig avdelingen i å lese parent's recipients direkte (samme mønster som vi nettopp løste for deviation categories).

### Løsning: Runtime-arv via SECURITY DEFINER RPC

**1. Ny database-funksjon `get_effective_flight_alert_config(_company_id uuid)`**
- `SECURITY DEFINER`, `STABLE`.
- Slår opp `companies.parent_company_id` og parent's `propagate_flight_alerts`.
- Hvis avdeling og parent propagerer → returner parent's alerts + recipients.
- Ellers → returner egne.
- Returnerer en JSON med to lister: `alerts` (alert_type, enabled, threshold_value) og `recipient_profile_ids` (uuid[]).
- Adgangssjekk: `_company_id IN get_user_visible_company_ids(auth.uid())`.
- GRANT EXECUTE til `authenticated`.

**2. Bruk RPC i `UploadDroneLogDialog.checkFlightAlerts`**
- Erstatt de to separate select-spørringene med ett `supabase.rpc("get_effective_flight_alert_config", { _company_id: companyId })`.
- Filtrer alerts på `enabled = true` i klienten (eller direkte i SQL).
- Hent profiles for `recipient_profile_ids` som før (allerede tilgjengelig via `profiles`-RLS).

**3. Fjern unødvendig kopiering i `ChildCompaniesSection` (valgfritt opprydd)**
- Når `propagate_flight_alerts = true` settes, trenger vi ikke lenger skrive alerts/recipients ned til avdelinger — RPC-en henter parent direkte.
- Behold dagens kopi som fallback for bakoverkompatibilitet, men ikke kritisk.

### Resultat
Flylogg-varsler trigget i en avdeling sjekker først om morselskapet har `propagate_flight_alerts = true`. Hvis ja, brukes morselskapets terskler og mottakerliste — ingen behov for å manuelt kopiere ned eller re-lagre avdelinger når mottakere endres på toppen.

### Filer som endres
- Migrasjon: ny funksjon `get_effective_flight_alert_config(uuid)`.
- `src/components/UploadDroneLogDialog.tsx` (bytt to selects til ett RPC-kall i `checkFlightAlerts`).

### Svar på spørsmålet ditt
**Nei, slik det fungerer i dag** får ikke mottakere på morselskapet varsler når terskler overskrides i en avdeling — selv med «Gjelder for alle underavdelinger» på. Planen over fikser nettopp dette.

