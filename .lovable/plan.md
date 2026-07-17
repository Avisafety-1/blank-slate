## Mål

Skru på det unified europeiske luftromssystemet **kun for selskapet "Moderavdeling"** (`af43f04e-7a0a-4c42-a1e2-dfdc883a9600`) som intern test i produksjon. Alle andre selskaper — inkludert alle norske brukere — skal være garantert upåvirket. NO holdes helt utenfor: kun DK/SE/DE/FI-data eksponeres, og bare til brukere i Moderavdeling.

## Slik virker gaten

I dag styres unified av en global boolean i `app_config` (`airspace_unified_dk_enabled = false`). Den erstattes ikke — den beholdes som master kill-switch. I tillegg legges det til en **allowlist på company-nivå** som må matche brukerens aktive selskap. Bare når *begge* er sanne får en bruker se unified data.

```text
User request
    │
    ▼
master flag ON?  ── nei ──▶ legacy only (dagens oppførsel)
    │ ja
    ▼
active_company_id ∈ allowlist?  ── nei ──▶ legacy only
    │ ja
    ▼
unified DK/SE/DE/FI slås inn i tillegg til legacy
```

Dette betyr at selv om noen skulle skru på master-flagget ved et uhell, ser ingen brukere unified før selskapet også er lagt i allowlist. Dobbel sperre.

## Hva som skjer i denne C1-fasen

1. Ny tabell `airspace_unified_company_allowlist` (kun `company_id` + notat + timestamps). Moderavdeling legges inn som eneste rad. Superadmin-only skriverett, autentiserte kan lese sin egen rad.
2. Ny RPC `is_unified_airspace_enabled_for_me(country text)` som sjekker master-flag OG at innlogget brukers aktive selskap står i allowlisten. Fail-closed på alle feil.
3. `src/lib/airspaceUnified.ts` bytter `isUnifiedAirspaceEnabled` til å kalle RPC-en over. TTL-cache beholdes (60 s).
4. Master-flagget `airspace_unified_dk_enabled` settes til `true`. Ingen andre ser noe fordi allowlisten er tom for alle utenom Moderavdeling.
5. Wiring inn i UI: `MissionMap` / `AirspaceWarnings` merger kall til `fetchUnifiedZonesForRoute("DK" | "SE" | "DE" | "FI")` med eksisterende legacy-analyse. Merge er additiv — legacy warnings vises som før, unified zones vises som ekstra kort med tydelig kildemerke (f.eks. "🇩🇰 Trafikstyrelsen (unified)"). Ingen legacy-kode fjernes.
6. Kartlagsvisning: `MapLayerControl` får en ny gruppe "Europa (testfase)" som kun renderes hvis RPC-en returnerer true. Den viser DK/SE/DE/FI-lag hentet fra `airspace_zones_in_bbox`. Skjult som default.

## Sikkerhetsgarantier for norske brukere

- **Ingen NO-adapter bygges eller kjøres.** `airspace_zones` inneholder ingen norske rader og skal ikke få det i denne fasen.
- **Legacy NO-tabeller (`caa_drone_zones`, `naturvern_zones`, `nsm_restriction_zones`, `vern_restriction_zones`, `rpas_5km_zones`, `rpas_ctr_tiz`) rørt ikke.**
- **Alle norske selskaper leser fortsatt kun fra legacy-tabellene** — RPC-en returnerer `false` for dem, og all unified-kode short-circuiter til `[]`.
- **Country-filter i alle unified-kall:** `p_country_codes: ['DK','SE','DE','FI']` — aldri NO, selv teoretisk.
- **Fail-closed:** hvis RPC-en feiler, `app_config` er utilgjengelig, eller brukeren ikke har aktivt selskap, returneres `false` og legacy vises.
- **Kill-switch:** admin kan når som helst sette master-flagg til `false` eller slette allowlist-rad → alt i Moderavdeling faller tilbake til legacy på maks 60 s.

## Verifisering før vi er ferdig

- Automatisk: RPC returnerer `true` for testbruker i Moderavdeling og `false` for testbruker i et norsk selskap.
- Manuell smoke test i Moderavdeling: opprett rute over dansk luftrom → se at både legacy DK-warnings og de nye "🇩🇰 unified"-warningene dukker opp.
- Regresjonstest på et norsk selskap: opprett rute i Norge → ingen endringer i kart eller warnings.
- Skjekk `airspace_shadow_comparisons` fortsetter å logge normalt.

## Etter C1

- Overvåk i noen dager med testbrukerne i Moderavdeling.
- Ved feil → toggl master-flagg av. Ingen ekte brukere berørt.
- Neste fase (utenfor denne planen): B7a NO-adapter + NO shadow-verify, deretter gradvis utrulling.

## Åpne spørsmål

1. Hvem er testbrukerne i Moderavdeling som skal ha tilgang? Er alle profiler koblet dit ok, eller ønsker du en snevrere gate (f.eks. kun superadmin + navngitte e-poster)?
2. Skal unified DK-warnings vises **i tillegg til** dagens legacy DK-warnings (mest info, men mulig duplikater), eller **erstatte** legacy DK-warnings i Moderavdeling (renere test, men fjerner sikkerhetsnett)? Anbefaler tillegg for C1.
