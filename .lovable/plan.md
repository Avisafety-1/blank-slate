# Currency-krav som selskapsinnstilling

## Mål
Admin setter ett currency-krav på morselskapet (f.eks. «minst 2 timer flytid siste 90 dager»). Kravet arves automatisk til alle avdelinger (ekte arv — endring i mor oppdaterer barn live), styrer perioden som vises på personellkortets KPI-er, og bestemmer status grønn/gul/rød på personellet.

## Status-logikk
For hver pilot summeres flytid i perioden (fra `flight_logs.flight_duration_minutes`):
- **Grønn** — timer ≥ krav
- **Gul** — timer < krav, men ≥ 80 % av krav (kravet er snart møtt)
- **Rød** — timer < 80 % av krav (kravet er overskredet)

Statusen tas inn i `fetchPersonnel` (useStatusData) via `worstStatus(...)` slik at den eksisterende kompetanse-statusen fortsatt teller.

## Database (migrasjon på `companies`)
Nye kolonner:
- `currency_requirement_enabled` boolean default false
- `currency_requirement_hours` numeric default 2
- `currency_requirement_days` int default 90
- `propagate_currency_requirement` boolean default false (når true overstyres avdelingenes verdier av morens)

Ingen RLS-endringer — feltene leses via samme `companies`-policyer som de andre innstillingene.

## UI — Generelle innstillinger (ChildCompaniesSection)
Nytt kort «Currency-krav for piloter» plassert sammen med øvrige toggles:
- Switch: Aktiver currency-krav
- Tall-input: «Minimum flytimer» (timer, desimaltall)
- Tall-input: «I løpet av siste … dager»
- Switch: «Tving samme krav på alle avdelinger» (= propagate)
- Når man er avdeling og mor har `propagate_currency_requirement=true`: feltene låses med `Lock`-badge «Arvet fra {parent}» (samme mønster som øvrige propagerte innstillinger)

## Frontend-tilkobling

**`useCompanySettings.ts`**
- Legg til de fire feltene i `CompanySettings`-interfacet, defaultSettings og `select(...)`.
- I merge-blokken: hvis `parentSettings.propagate_currency_requirement` er true, overskriv `currency_requirement_enabled/_hours/_days` med morens verdier (samme mønster som `incident_reports_visible_to_all_companies`).

**`PersonnelFlightKpi.tsx`**
- Les `useCompanySettings()`. Når `currency_requirement_enabled` er på:
  - Sett periodene til `[currency_requirement_days, ...gjeldende ekstra perioder]` slik at currency-perioden alltid er første KPI-kort.
  - Vis krav-linje under kortet (f.eks. «Krav: 2t / 90d») og fargemarker tallet grønn/gul/rød ut fra status­logikken over.
- Fjern den per-bruker «Påvirker status»-switchen og tilhørende `flight_time_affects_status`-lesing/skriving (erstattes av selskapsinnstillingen). Blyant-popoveren beholder bare brukervalgte perioder (localStorage som i dag).

**`useStatusData.ts` — `fetchPersonnel`**
- Hent gjeldende `companies`-rad for innlogget bruker (samt parent når aktuelt) for å resolve currency-kravet inkl. arv. Bruk samme `fetchCompanySettings`-cache der det er praktisk, eller direkte spørring innenfor hooken.
- Hvis kravet er aktivt: hent `flight_logs` (user_id, flight_duration_minutes) for alle synlige `personIds` med `flight_date >= now - days`, summer pr. bruker, mappe til Grønn/Gul/Rød etter terskelen, og `worstStatus(competencyStatus, currencyStatus)`.
- Fjern bruken av `profile.flight_time_affects_status` (kolonnen kan bli liggende ubrukt — ingen nedmigrering nødvendig).

## Rekkefølge
1. Migrasjon (companies-kolonner) — krever godkjenning.
2. `useCompanySettings.ts` utvides med felt + arv.
3. UI-blokk i `ChildCompaniesSection.tsx` (state, handlers, kort med Lock-badge).
4. `useStatusData.ts` bytter fra per-bruker flagg til selskapsinnstilling.
5. `PersonnelFlightKpi.tsx` kobler periode + krav-indikator til settingen og fjerner per-bruker switch.

## Avgrensning
- Beholder `flight_time_affects_status`-kolonnen i databasen (urørt) for å unngå datatap; ingen UI leser den lenger.
- 80 %-terskelen for «gul» er hardkodet nå; kan eksponeres som egen innstilling senere ved behov.
