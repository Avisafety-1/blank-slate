Plan:

1. Fiks datamappingen mellom `check_mission_airspace` og AI-konteksten
   - Dagens AI-kontekst leser gamle feltnavn (`z_type`, `z_name`, `min_distance`, `route_inside`), men tidligere/eldre luftromsresultater kan også bruke `zone_type`, `zone_name`, `distance_meters`, `is_inside`.
   - Jeg normaliserer begge formatene før prompten bygges, slik at `inside`, `type`, `name` og `distance` alltid blir korrekte.

2. Gjør luftromsstatus deterministisk etter AI-svaret
   - Etter AI har returnert JSON, overskriver systemet luftromstekst og `air_risk_analysis` med serverberegnet fasit.
   - Hvis `requires_ninox_approval=false`, fjernes/forhindres all tekst om at Ninox kreves eller at oppdraget er innenfor 5 km-sonen.
   - Hvis `inside_controlled_airspace=false`, fjernes/forhindres hardstop/no-go begrunnet i CTR/TIZ.

3. Korriger hardstop/recommendation når eneste hardstop er feil luftromstolkning
   - Hvis AI setter `hard_stop_triggered=true` på grunn av CTR/5 km, men serverdata sier utenfor CTR/TIZ og utenfor 5 km, settes hardstop til `false`.
   - `hard_stop_reason` nullstilles, og anbefalingen beregnes på nytt fra score og andre faktiske hardstop-kriterier.

4. Stram prompten på regelverket
   - Presiser at utenfor 5 km-sonen + maks 120 m AGL ikke i seg selv krever Ninox-godkjenning.
   - Presiser at nærhet til 5 km-sone/CTR er en informasjons-/forsiktighetsmerknad, ikke hardstop, med mindre `inside=true`.

Teknisk notat:
- Jeg endrer kun `supabase/functions/ai-risk-assessment/index.ts` med en liten normaliserings-/guard-funksjon og promptjustering.
- Ingen databaseendring er nødvendig for denne runden.