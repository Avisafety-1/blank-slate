## Plan

1. **Skill tydelig mellom flyplass og 5km-sonegrense i AI-data**
   - Endre `airspaceFacts` i `supabase/functions/ai-risk-assessment/index.ts` slik at 5KM-varsler får eksplisitte felter/tekst som sier at `distance` er avstand til **5km-sonens grense**, ikke til flyplassen.
   - Unngå formuleringer som kan tolkes som “329 m fra Trondheim lufthavn”. Bruk konsekvent: “329 m utenfor 5 km-sonens grense rundt Trondheim lufthavn, Værnes”.

2. **Gi AI-en autoritativ, ferdig formulert luftromstekst**
   - Legg inn egne felt i kontekstdata, f.eks. `distance_kind: "zone_boundary"`, `distance_label: "avstand til 5 km-sonegrense"`, og `outside_zone_text` for 5KM.
   - Oppdatere prompt-reglene slik at AI aldri får omtale 5KM-avstanden som avstand til selve flyplassen/aerodromen.

3. **Stramme inn etterkontrollen etter AI-svaret**
   - Utvide deterministic guard til å rense/korrigere fritekst, `summary`, `hard_stop_reason`, `mission_overview`, `airspace.actual_conditions`, `airspace.concerns` og `air_risk_analysis.aec_reasoning` når den sier “X meter fra flyplassen/lufthavn/aerodrome” basert på en 5KM-boundary-avstand.
   - Hvis oppdraget er utenfor 5KM og utenfor CTR/TIZ, skal hard stop pga. luftrom fjernes og luftromsbeslutning settes til riktig status.

4. **Gjøre hard-stop-korrigeringen mer robust**
   - Dagens rydding kan la hard stop stå hvis andre kategorier er `NO-GO` selv om hard stop-årsaken egentlig er falsk luftromslogikk. Jeg vil splitte dette slik at falsk luftroms-hardstop alltid fjernes/erstattes, mens andre reelle `NO-GO`-forhold fortsatt kan gi `no-go` uten falsk CTR/5KM-begrunnelse.

5. **Legge inn lokal regresjonstest for akkurat dette tilfellet**
   - Lage en liten testbar hjelpefunksjon eller inline testdata for scenariet: `5KM`, `inside=false`, `distance=329`, navn `Trondheim lufthavn, Værnes`.
   - Verifisere at output-teksten sier “utenfor 5 km-sonen” og “329 m fra sonegrensen”, og ikke “329 m fra flyplassen”.

## Teknisk notat

Databasefunksjonen `check_mission_airspace` returnerer `min_distance` som `ST_Distance(..., zone_geometry)`. For `rpas_5km_zones` betyr det avstand til polygonet/sonens yttergrense, ikke avstand til flyplassens punkt/senter. Feilen bør derfor løses i AI-kontekst/prompt/guard, ikke ved å endre badge-logikken som allerede bruker `route_inside` riktig.