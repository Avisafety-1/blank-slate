# Gjør bytte av drone/pilot trygt

## Svar kort: det fungerer, men det er tre reelle svakheter i dagens logikk

Verifisert i koden og databasen:

1. **Annet personell på flyturen slettes.** Ved pilotbytte slettes ALLE rader i `flight_log_personnel` for loggen, og kun den nye piloten settes inn igjen. I basen finnes det flylogger med to personer knyttet til seg (f.eks. pilot + observatør) — disse mister den andre personen ved bytte.
2. **Advarsler kan flyttes feil.** Drone-loggbokoppføringer flyttes ved å matche på drone + dato + `entry_type='Advarsel'` + samme bruker. En manuelt skrevet advarsel samme dag av samme bruker (uten sammenheng med denne flyturen) blir også flyttet.
3. **Ingen transaksjon.** Operasjonen er 5–7 separate kall fra nettleseren. Feiler ett kall midtveis (f.eks. RLS på ny drones selskap), blir loggen stående halvveis flyttet: ny drone satt, men flytimer ikke justert.

Det som fungerer riktig i dag: dronetimene flyttes manuelt begge veier og dobbelttelles ikke (DB-triggeren `trg_update_drone_hours` kjører kun ved INSERT), og pilotens akkumulerte timer regnes automatisk ut på nytt for både gammel og ny pilot via `trg_flp_recompute_pilot`.

## Endringer

### 1. Flytt hele operasjonen til én transaksjon i databasen
Ny SECURITY DEFINER-funksjon `reassign_flight_log(p_flight_log_id, p_drone_id, p_pilot_id)` som gjør alt i én transaksjon: enten går alt gjennom, eller ingenting endres. Funksjonen sjekker at kalleren har tilgang til både loggen og mål-selskapene (`get_user_visible_company_ids`, superadmin-bypass), og at brukeren har rett til å endre loggen (samme regel som sletting: admin/operativ leder eller eier av loggen).

### 2. Bevar øvrig personell
Ved pilotbytte byttes kun raden til den nåværende piloten (UPDATE av `profile_id`, eller INSERT hvis ingen pilot finnes). Andre personer på flyturen røres ikke. Timene for gammel og ny pilot regnes ut på nytt av eksisterende trigger.

### 3. Presis flytting av loggbokoppføringer
Advarsler flyttes kun når teksten/oppføringen faktisk kan knyttes til flyturen (samme drone, samme dato, samme bruker OG opprettet i samme tidsvindu som flyloggen ble behandlet). Oppføringer som ikke entydig hører til flyturen blir liggende igjen, og dialogen sier tydelig hvor mange oppføringer som flyttes.

### 4. Bekreftelsessteg og etterkontroll
- Før lagring vises en oppsummering: «X flytimer flyttes fra Drone A til Drone B, Y advarsler flyttes, piloten byttes fra Ola til Kari (andre på flyturen beholdes)».
- Merk at flytting av timer også påvirker vedlikeholdsstatus på begge droner (`hours_at_last_inspection`), dette nevnes i bekreftelsen.
- Etter lagring lastes «Loggført på»-fanen på nytt, slik at Ja/Nei-status og timer viser den nye tilstanden.

### 5. Sporbarhet
Hver reassign skriver en oppføring i dronens loggbok hos begge droner («Flylogg flyttet hit/herfra», med logg-ID og dato), slik at endringen kan spores i ettertid. Tilsvarende notat i personell-loggboken ved pilotbytte.

## Teknisk

- Ny migrasjon: `public.reassign_flight_log(uuid, uuid, uuid)` — SECURITY DEFINER, `search_path=public`, tilgangssjekk + all mutasjon (flight_logs.drone_id/user_id, drones.flyvetimer +/-, flight_log_personnel UPDATE/INSERT, drone_log_entries flytting, personnel_log_entries `profile_id`-UPDATE i stedet for delete+insert), returnerer jsonb med hva som ble endret.
- `src/lib/flightLogReassign.ts`: erstatt den sekvensielle klient-logikken med ett `supabase.rpc("reassign_flight_log", ...)`-kall; behold en `previewFlightLogReassign()` som kun leser data for bekreftelsesteksten.
- `src/components/dashboard/ReassignFlightLogDialog.tsx`: legg til bekreftelsessteg med oppsummering før lagring.
- `src/components/dashboard/FlightSummaryPanel.tsx`: refetch av kontekst etter vellykket bytte.
- Nye i18n-nøkler i `no.json` og `en.json`.
