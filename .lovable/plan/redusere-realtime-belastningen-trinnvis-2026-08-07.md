# Redusere realtime-belastningen — trinnvis

Tilbakemeldingene er gode og planen legges om til fire adskilte trinn. Vi gjør trinn 1 alene, måler effekten, og går videre først når tallene bekrefter hypotesen.

## Grunnlaget (verifisert)

`realtime.list_changes`: 1 026 515 kall, 26,5 mill. rader, 18t 5m (87,3 % av total tid).

Endringsvolum for tabellene som ligger i `supabase_realtime`:

| Tabell | ins + upd + del |
|---|---|
| safesky_beacons | ~29,4 millioner (28,5 mill. UPDATE) |
| companies | 625 |
| internal_message_recipients | 505 |
| alle øvrige til sammen | under 1 000 |

`safesky_beacons` har `REPLICA IDENTITY FULL` og oppdateres kontinuerlig av lufttrafikk-cronen. Lytteren i `src/lib/mapSafeSky.ts` bruker ikke payloaden — den kaller bare `debouncedFetchSafeSky()`.

---

## Trinn 1 — Ta safesky_beacons ut av realtime (gjøres nå, alene)

**Database (én migrasjon, kun denne tabellen):**
- `ALTER PUBLICATION supabase_realtime DROP TABLE public.safesky_beacons;`
- `ALTER TABLE public.safesky_beacons REPLICA IDENTITY DEFAULT;`

**Frontend (`src/lib/mapSafeSky.ts`):**
- Fjern `postgres_changes`-abonnementet og `safeskyChannel`.
- Start i stedet ett polling-intervall på 15 sekunder som kaller `debouncedFetchSafeSky()`.
- Intervallet eies av samme manager-instans som allerede finnes (`createSafeSkyManager` opprettes én gang per kartinstans). `start()` sjekker `if (safeskyPollInterval) return;` før den setter et nytt, så det er garantert nøyaktig ett aktivt interval per kartinstans — uavhengig av re-render. `stop()`, `reconnect()` og `cleanup()` rydder det som i dag.
- Pollingen kjører kun mens lufttrafikk-laget er aktivt (`start()`/`stop()` styres allerede av laget).
- Eksisterende adferd beholdes uendret: warm-up, startup-retry-burst, `moveend`/`zoomend`-refetch, zoom-terskel og bbox-filter.

**Ingen funksjonalitetstap:** cron-jobben skriver data periodisk, og fetch-logikken er identisk. I praksis blir forskjellen at oppdateringen skjer på fast kadens i stedet for umiddelbart etter cron-skrivingen — maks noen sekunders forsinkelse på trafikkbildet, samtidig som kartpanorering fortsatt oppdaterer umiddelbart.

**Måling:** etter utrulling følger vi `realtime.list_changes` i 12–24 timer. Faller kall/radvolum dramatisk, er hypotesen bekreftet.

---

## Trinn 2 — Rydde subscriptions (etter måling)

Først kartlegger vi, per lytter, hva brukeren faktisk mister uten realtime. Utgangspunktet er "færrest mulig realtime-tabeller", ikke å få eksisterende lyttere til å virke.

Disse tabellene har lyttere i koden, men ligger **ikke** i publiseringen — de gir null hendelser i dag:
`profiles`, `user_roles`, `personnel_competencies`, `calendar_events`, `documents`, `active_flights`, `flight_logs`, `mission_personnel`, `mission_drones`, `mission_map_publications`, `training_assignments`, `dronetag_devices`, `eccairs_exports`.

Siden funksjonene har fungert akseptabelt uten hendelser hele tiden, er standardvalget **å fjerne lytteren**. Kun `active_flights` peker seg klart ut som reell sanntidskandidat (pågående flygninger på kart og dashbord). For `profiles` (godkjenningsbadge), `personnel_competencies` og `calendar_events` dokumenterer vi konsekvensen først og velger React Query-invalidering/refetch der det holder.

Berørte filer: `useDashboardRealtime.ts`, `Resources.tsx`, `Kalender.tsx`, `Admin.tsx`, `useOppdragData.ts`, `OpenAIPMap.tsx`, `Hendelser.tsx`, `PendingApprovalsBadge.tsx`.

---

## Trinn 3 — Filtre på selskap (etter trinn 2)

Legg til `filter: company_id=eq.<companyId>` på lytterne der kolonnen finnes (`drones`, `equipment`, `missions`, `incidents`).

Presisering: dette reduserer autoriserings- og fanout-arbeidet per abonnent, ikke selve WAL-/write-volumet. Databasen må fortsatt dekode hver endring.

---

## Trinn 4 — REPLICA IDENTITY (til slutt, forsiktig)

Verifisering viser at flere lyttere faktisk bruker `payload.old`:
- `Hendelser.tsx` leser `old.incident_id` på DELETE fra `eccairs_exports` og `incident_comments` — **må beholde FULL**.
- `AuthContext.tsx`, `DocumentSection.tsx`, `CalendarWidget.tsx`, `IncidentsSection.tsx` leser `old.id` på DELETE — primærnøkkel er tilgjengelig også med `DEFAULT`, så disse er trygge.

Vi setter derfor `REPLICA IDENTITY DEFAULT` kun på tabeller der ingen kode leser andre felt enn primærnøkkelen fra `old`, og lar resten stå. Endringsvolumet på disse tabellene er uansett under 1 000 rader, så gevinsten er marginal — dette er opprydding, ikke ytelsestiltak.

---

## Teknisk oppsummering

- Trinn 1 er én liten migrasjon + én fil endret. Ingen endring i datamodell, RLS eller edge functions.
- Hvert trinn kan rulles tilbake for seg.
- Vi måler mellom hvert trinn i stedet for å gjøre alt i én migrasjon.
