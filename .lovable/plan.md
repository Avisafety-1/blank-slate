# Redusere realtime-belastningen på databasen

## Hva målingene viser

Query Performance-rapporten peker på `realtime.list_changes` som den soleklart største forbrukeren: 1 026 515 kall, 26,5 millioner rader behandlet, 18t 5m total tid (87,3 %).

Databasen bekrefter årsaken. Tabellstatistikk for tabellene som ligger i `supabase_realtime`-publiseringen:

| Tabell | Endringer (ins+upd+del) |
|---|---|
| safesky_beacons | ~29,4 millioner |
| alle andre til sammen | under 2 000 |

`safesky_beacons` står altså for i praksis 100 % av WAL-trafikken realtime må lese, dekode og RLS-sjekke. Tabellen har i tillegg `REPLICA IDENTITY FULL`, som betyr at hele den gamle raden skrives til WAL ved hver eneste oppdatering — og lufttrafikk-cronen oppdaterer alle beacons kontinuerlig.

Frontenden abonnerer på tabellen i `src/lib/mapSafeSky.ts`, men callbacken gjør bare `debouncedFetchSafeSky()` — den bruker ikke payloaden. Vi betaler altså for full radreplikering av 28 millioner oppdateringer for å utløse en debounced refetch.

## Endringer

### 1. Ta safesky_beacons ut av realtime (størst effekt)
- Fjern tabellen fra `supabase_realtime`-publiseringen.
- Sett `REPLICA IDENTITY DEFAULT` på tabellen så WAL-radene blir små.
- I `mapSafeSky.ts`: erstatt postgres_changes-abonnementet med et polling-intervall (variabelen `safeskyPollInterval` finnes allerede, men settes aldri) på ca. 15 sekunder, som kaller samme `debouncedFetchSafeSky()`. Kartbevegelse (`moveend`/`zoomend`) fortsetter å trigge refetch som i dag. Intervallet stoppes i `stop()` og når laget skrus av, slik at det bare går når lufttrafikk-laget er synlig.

Brukeropplevelsen blir tilnærmet uendret — dataene oppdateres uansett bare så ofte som cron-jobben skriver dem.

### 2. Rydd bort døde abonnementer
Flere `postgres_changes`-lyttere peker på tabeller som ikke ligger i publiseringen og derfor aldri kan gi hendelser. De koster kanal-oppsett og RLS-oppslag ved hver tilkobling uten å gi noe:
`profiles`, `user_roles`, `personnel_competencies`, `calendar_events`, `documents`, `active_flights`, `flight_logs`, `mission_personnel`, `mission_drones`, `mission_map_publications`, `training_assignments`, `dronetag_devices`, `eccairs_exports`.

Berørte filer: `useDashboardRealtime.ts`, `Resources.tsx`, `Kalender.tsx`, `Admin.tsx`, `useOppdragData.ts`, `OpenAIPMap.tsx`, `Hendelser.tsx`, `PendingApprovalsBadge.tsx`.

Her er det to valg per tabell, og jeg foreslår:
- Tabeller der sanntid faktisk gir verdi i dag (`profiles` for godkjenningsbadge, `active_flights` for aktive flygninger, `personnel_competencies`, `calendar_events`) — **legg dem til i publiseringen**, siden endringsvolumet er neglisjerbart. Da begynner funksjonaliteten faktisk å virke.
- Resten — **fjern lytteren** og la eksisterende refetch/invalidations dekke behovet.

### 3. Filtrer abonnementene på selskap
Abonnementene på `drones`, `equipment`, `missions`, `incidents` osv. er uten filter, så realtime må RLS-vurdere hver endring mot hver tilkoblede klient. Legg til `filter: company_id=eq.<companyId>` der kolonnen finnes, slik at serveren kan forkaste irrelevante rader tidlig.

### 4. Slå av REPLICA IDENTITY FULL der det ikke trengs
`drones`, `equipment`, `incidents`, `drone_log_entries`, `equipment_log_entries`, `customers`, `news`, `internal_message_recipients` m.fl. står på FULL. Ingen av lytterne bruker `payload.old`, så `DEFAULT` holder og halverer WAL-størrelsen.

## Teknisk

- Migrasjoner: `ALTER PUBLICATION supabase_realtime DROP TABLE public.safesky_beacons;`, `ALTER TABLE ... REPLICA IDENTITY DEFAULT;` og `ADD TABLE` for de tabellene vi beholder sanntid på.
- Ingen endring i datamodell, RLS eller edge functions.
- Etter utrulling: verifiser i Query Performance at `realtime.list_changes` faller kraftig i kall og radvolum.
