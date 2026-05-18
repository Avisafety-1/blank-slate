# Fiks AI-forvirring rundt 5 km-sone (Flesland m.fl.)

## Problem
AI-risikovurderingen for oppdraget «Gravdalsvatnet – Bergen – Norconsult» påstår at oppdraget er **innenfor 5 km av Flesland**, selv om ruten faktisk ligger utenfor 5 km-sonen. AI får riktig data fra `check_mission_airspace` (zonetype `5KM`, `route_inside=false`, `min_distance` i meter), men i prompten finnes det ingen eksplisitt instruksjon om hvordan disse feltene skal tolkes. Modellen ser «5KM» i navnet og konkluderer feilaktig at oppdraget er innenfor sonen.

## Løsning
Stramme inn system-prompten i `supabase/functions/ai-risk-assessment/index.ts` slik at modellen alltid bruker `inside`-flagget og `distance`-feltet eksplisitt, og skiller tydelig mellom «innenfor» og «utenfor» 5 km-sonen (og tilsvarende for CTR/TIZ, NOTAM, naturvern osv.).

### Konkrete prompt-endringer
1. **I avsnittet «Bruk kontekstdata» (linje 1543–1547):** Legg til en eksplisitt regel:
   - `inside=true` ⇒ ruten ligger **inne i** sonen.
   - `inside=false` ⇒ ruten ligger **utenfor** sonen; `distance` angir nærmeste avstand i meter.
   - Modellen skal aldri si «innenfor X» når `inside=false`.
2. **Ny seksjon «Tolkning av luftromsadvarsler»** rett før AEC-tabellen, med formuleringseksempler:
   - 5KM `inside=true` → «Oppdraget er innenfor 5 km-sonen rundt …, krever Ninox-godkjenning, maks 120 m AGL.»
   - 5KM `inside=false` → «Oppdraget er **utenfor** 5 km-sonen rundt … (nærmeste avstand: N meter / N,N km). Ingen Ninox-godkjenning kreves.»
   - CTR/TIZ tilsvarende.
3. **I `airspace.actual_conditions`-feltet** krev at modellen alltid eksplisitt angir avstand i meter/km når `inside=false`, og bruker ordene «innenfor» / «utenfor» konsekvent.
4. **Konsekvens for `air_risk_analysis.aec_reasoning`:** når alle 5KM/CTR/TIZ-advarsler har `inside=false`, skal modellen ikke automatisk anta klasse D — bruke avstanden til å begrunne valgt klasse.

### Hva som IKKE endres
- `check_mission_airspace`-RPCen og felt-strukturen sendt til AI er allerede korrekt.
- Frontend-visning (`AirspaceWarnings.tsx`) er allerede korrekt — den bruker `is_inside`.
- Ingen DB-migrasjon, ingen RLS-endringer.

## Teknisk
- Fil: `supabase/functions/ai-risk-assessment/index.ts` (kun prompt-strenger ca. linje 1310–1320 og 1543–1547, samt JSON-skjema-kommentar for `airspace.actual_conditions`).
- Edge function blir automatisk re-deployert.
- Etter deploy: be brukeren regenerere risikovurderingen for det aktuelle oppdraget og verifisere at AI nå sier «utenfor 5 km-sonen rundt Flesland (X m unna)».

## Memory-oppdatering
Legg til en notis i `mem://architecture/missions/ai-risk-assessment-logic` om at 5KM/CTR/TIZ-advarsler MÅ tolkes med `inside`-flagget, ikke bare på navn.
