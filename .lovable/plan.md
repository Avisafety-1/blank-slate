# Fiks «Flight log not accessible» ved bytte av pilot

## Årsak (verifisert)

Databasefunksjonen `reassign_flight_log` sjekker tilgang med `can_user_access_company()`. Den funksjonen slår kun opp i tabellen `user_companies` (pluss barn-selskaper for admin, pluss superadmin).

I Elverum videregående skole har 7 av 9 brukere ingen rad i `user_companies` — de er knyttet til selskapet via `profiles.company_id`, slik resten av appen bruker (`get_user_visible_company_ids`). Da feiler sjekken og funksjonen kaster «Flight log not accessible», selv om brukeren tydelig hører til selskapet og eier loggen.

Samme problem gjelder de to andre sjekkene i funksjonen: «Target drone not accessible» og «Target pilot not accessible».

## Endring

Én migrasjon som oppdaterer `reassign_flight_log` slik at alle tre tilgangssjekkene bruker samme regel som resten av appen:

- Tillat når selskapet ligger i `get_user_visible_company_ids(auth.uid())` (bruker sitt eget selskap, og for admin også underavdelinger), ELLER når `can_user_access_company()` fortsatt gir treff (bakoverkompatibelt for brukere som kun er koblet via `user_companies`), ELLER superadmin.
- Ingen endring i hvem som får lov til å endre loggen (fortsatt admin/operativ leder/superadmin, eller den som eier loggen).
- Ingen endring i selve flyttingen av flytimer, dronelogg-oppføringer eller personell-oppføringer.

## Teknisk

- Migrasjon: `CREATE OR REPLACE FUNCTION public.reassign_flight_log(...)` — kun de tre `RAISE EXCEPTION ... not accessible`-sjekkene byttes ut med et felles uttrykk:
  `_company = ANY(public.get_user_visible_company_ids(v_uid)) OR public.can_user_access_company(v_uid, _company) OR public.has_role(v_uid,'superadmin')`.
- Funksjonen forblir `SECURITY DEFINER` med `SET search_path = public`.
- Ingen frontend-endringer og ingen nye strenger.
