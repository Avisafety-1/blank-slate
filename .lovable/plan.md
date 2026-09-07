# Gjennomgang: kunne flylogger havne på feil selskap?

## Kort svar

Nei. Data ble aldri logget på et annet selskap, og dialogen kunne ikke se droner utenfor din egen avdeling med underavdelinger. Jeg var upresis i forrige svar — beklager.

## Hva jeg faktisk fant

Kontrollert direkte mot databasen og koden:

- **Droner er låst i databasen.** Regelen for lesing av droner tillater kun droner i selskaper du har tilgang til (din avdeling + underavdelinger), pluss droner som eksplisitt er delt til deg. Selv om spørringen i dialogen ikke selv anga avdeling, ble den avgrenset av denne regelen. Samme regel gjelder utstyr og batterityper.
- **Lagring bruker alltid ditt eget selskap.** Når flyloggen lagres, settes selskapet til din egen avdeling — aldri dronens. Så en logg kan ikke bli registrert på et annet selskap.
- **Bakgrunnsimporten (DJI) er også avgrenset.** Den automatiske matchingen ved opplasting søker kun i loggens eget selskap og eventuell moderavdeling, med prioritet på eget selskap.
- **Hvorfor listen din likevel kunne inneholde en «feil» MAVIC 2:** en administrator ser droner i både moderavdeling og alle underavdelinger. Duplikatene med serienummer `163DFAQ0016VW6` ligger i andre selskaper (Test/Avisafe) og var derfor ikke synlige for deg — men på tvers av dine egne avdelinger kan flere droner dele samme serienummer, og da kan feil avdeling bli valgt.

Endringen jeg allerede gjorde (avgrense dronelisten til synlige avdelinger) er altså en ryddighetsforbedring, ikke en sikkerhetsfiks. Den kan stå.

## Foreslått oppfølging

1. **Tydeligere dronevalg.** Vis avdelingsnavn i nedtrekkslisten for droner i flylogg-dialogen, slik at «MAVIC 2 (Avdeling Oslo)» ikke forveksles med «MAVIC 2 (Moderavdeling)».
2. **Prioriter egen avdeling ved match.** Når flere droner treffer samme serienummer, velg drone i din aktive avdeling først; ellers marker som flertydig og la brukeren velge (i dag avgjøres det av navn/pilottilknytning).
3. **Advarsel ved avdelingskryssing.** Hvis valgt drone tilhører en annen avdeling enn loggen lagres på, vis en tydelig, men ikke-blokkerende merknad i dialogen.
4. **Rydd opp i duplikatene.** De fire dronene som deler serienummer `163DFAQ0016VW6` bør ryddes (jeg kan liste dem, du bestemmer hva som slettes/endres).

## Teknisk

- RLS på `drones`/`equipment`/`battery_types`: `company_id = ANY(get_user_visible_company_ids(auth.uid()))` (+ `*_department_visibility`). `get_user_visible_company_ids` gir admin/administrator/superadmin egen avdeling + direkte underavdelinger; øvrige roller kun egen avdeling.
- `flight_logs` settes med `company_id: companyId` (brukerens eget selskap) i `UploadDroneLogDialog.tsx`.
- `supabase/functions/dji-process-single/index.ts` bygger `searchCompanyIds = [pendingLog.company_id, parent]` og foretrekker treff i eget selskap.
- Punkt 1–3 gjøres i `src/lib/droneLogMatching.ts` (`findSnMatches`, `droneOptionLabel`) og `src/components/UploadDroneLogDialog.tsx` + `src/components/upload/BatchLogPanel.tsx`; krever `company_id`/avdelingsnavn i dronespørringen. Nye tekster legges i `no.json` og `en.json`.
