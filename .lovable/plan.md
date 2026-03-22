

## Plan: Fiks SORA-arvebannere og synlighet

### Problem 1: Morselskapet viser feil banner
Norconsult (morselskapet) har en egen `company_sora_config`-rad, så `hasOwnConfig` settes til `true`. Banneret «Denne avdelingen har egne innstillinger som overstyrer morselskapet» vises — men Norconsult har ingen forelder å overstyre.

**Fiks**: I `fetchConfig`, sjekk om selskapet har `parent_company_id`. Bare sett `hasOwnConfig` (med overstyrings-banner) dersom selskapet faktisk er en avdeling (har parent). For morselskapet vises det vanlige info-banneret.

### Problem 2: Avdelinger ser ikke morselskapets tekst
Fallback-logikken ser korrekt ut i koden — den henter morselskapets config inkl. `operative_restrictions` og `policy_notes`. Men det kan være at avdelingene allerede har en tom config-rad (upserted fra en tidligere lagring), som gjør at `data` ikke er null og fallback aldri kjører.

**Fiks**: I `fetchConfig`, når `data` finnes men selskapet har `parent_company_id`, sett `hasOwnConfig=true` og hent også parent-navnet for banneret. Når `data` ikke finnes og parent config brukes, sørg for at `operative_restrictions` vises korrekt (dette fungerer allerede via `applyConfigData`).

### Endring — `CompanySoraConfigSection.tsx`

1. Etter `data` er hentet (linje 141-143): sjekk `parent_company_id` for dette selskapet. Sett `hasOwnConfig` bare dersom selskapet er en avdeling med forelder.
2. Flytt parent-sjekken slik at vi alltid vet om selskapet er en avdeling — uavhengig av om det har egen config.
3. For morselskapet (ingen `parent_company_id`): vis det vanlige info-banneret (linje 364-374), aldri overstyrings-banneret.

### Filer
- `src/components/admin/CompanySoraConfigSection.tsx` — fiks bannerlogikk basert på `parent_company_id`

