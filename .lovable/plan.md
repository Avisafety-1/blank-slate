## Funn frå logger og kode (Breili drift, Dan Asle Nesheim)

Eg har sjekka databasen og koden mot dei tre symptoma. Konklusjonar:

### 1) "Avslutt"-knappen responderte ikkje
- `handleEndFlight` → `prepareEndFlight()` (i `src/hooks/useFlightTimer.ts`) gjer eit `supabase.from('active_flights').select(...).maybeSingle()` UTAN timeout og UTAN feilhandtering. Viss nettverket er tregt eller tokenet må fornyast (`fetchWithRetry` → `ensureFreshSession`), heng kallet — og knappen viser ingen loading-tilstand, så han ser "død" ut.
- Ingen `toast.error` blir vist viss `prepareEndFlight` returnerer `null` eller kastar. Brukaren får null tilbakemelding.
- Det er òg ein "race": viss `state.isActive=true` lokalt, men DB-rada allereie er sletta (anna fane / forrige forsøk), returnerer spørringa null-felt, men dialogen opnar likevel — ikkje feilen Dan såg, men relatert.

Til slutt vart turen logga manuelt 27.05 kl. 08:22 UTC via `flight_logs` (`source=manual`, 35 min). Det stadfestar at endFlight til slutt gjekk gjennom, men brukaren måtte vente / prøve fleire gonger.

### 2) Flyturen stod framleis "aktiv" på same eining etter avslutting
- `useFlightTimer.checkActiveFlight()` køyrer berre på mount og når `user` endrar seg. Det er INGEN re-sync ved `visibilitychange`, `online`, eller via Realtime på `active_flights`.
- Konsekvens: viss `endFlight()` slettar DB-rada men feilar i å rydde localStorage (t.d. dialog stengt før `endFlight` køyrde, offline kø, eller exception), eller om ein annan fane sletta rada, vil eininga halde fram med å vise `isActive=true` til sida blir rerendra/last på nytt. Akkurat dette mønsteret samsvarer med rapporten: "anna eining viste avslutta, denne viste framleis aktiv".

### 3) Login-loop på PC: "Innlogging vellykka" repeterer, login-vindauget blir verande
- Auth-flyten ligg på `https://login.avisafe.no` og kastar brukaren over til `https://app.avisafe.no` via `redirectToApp()` (i `src/config/domains.ts`). Det er to ulike opphav (origins) → Supabase sin localStorage-sesjon blir IKKJE delt mellom dei.
- I `src/pages/Auth.tsx` linje 210–224 fyrer ein useEffect `redirectToApp('/')` kvar gong `user` er sett. På `app.avisafe.no` finn `RequireAuth` ingen sesjon → sender brukaren tilbake til `login.avisafe.no/auth` → useEffect ser at `user` framleis er sett → toast "loginSuccess" + redirect igjen → endeleg loop.
- Reload "fiksar" det fordi `ensureFreshSession` til slutt får synka tokens (eller Supabase-cookie på `.avisafe.no`) inn på app-domenet.
- Auth-loggane viser òg uvanleg mange `/user`-kall (10+ på under 30s frå ulike AWS-IP-ar) som passar med ein loop.

### Forslag til fiksar

**A. `useFlightTimer.ts` – robust endFlight**
1. Legg ein `endingFlight`-state og gjer "Avslutt"-knappen i `Index.tsx` `disabled` + spinner medan han er sann, slik at brukaren får synleg respons.
2. Pakk `prepareEndFlight` sin DB-spørjing i `Promise.race` med 5 s timeout. Ved timeout: behald lokal data og opne dialog likevel (track frå lokal cache), pluss `toast.warning("Nettverk tregt – brukar lokale data")`.
3. Vis `toast.error` ved kasta exception i `handleEndFlight`.

**B. `useFlightTimer.ts` – auto-resync av aktiv flytur**
1. Re-køyr `checkActiveFlight` ved `document.visibilitychange` (når fana blir synleg igjen) og ved `online`-event.
2. Lytt til Realtime DELETE på `public.active_flights` filtrert på `profile_id=eq.<user.id>` og rydd lokal state + localStorage automatisk.

**C. `Auth.tsx` – stogg redirect-loop**
1. Sett ein `sessionStorage`-flagg `avisafe_redirecting_to_app` rett før `redirectToApp('/')` og sjekk han ved start av Auth.tsx; viss han er sett OG `user` framleis er på login-domenet etter ≥3 s, tøm flagget men IKKJE redirect igjen — vis i staden ein knapp "Opne app" med direkte lenke til `https://app.avisafe.no/`, slik at brukaren slepp loop.
2. Vis kun éin `toast.success(loginSuccess)` per påloggingsforsøk (flytt toast inn i sjølve `signInWithPassword`-handlaren, fjern den frå MFA/Google-grenene som dublerer, eller bruk `toast.success(..., { id: 'login' })` for dedup).
3. Vurder å konfigurere Supabase Auth med cookie på `.avisafe.no` (krever endring i Supabase-prosjektet sine Auth-innstillingar — eg kan ikkje gjere det automatisk, men eg dokumenterer det).

**D. Tilbakemelding til Dan**
Eg lagar eit kort norsk svar du kan sende tilbake som forklarer kva som skjedde og at fiksane er rulla ut.

### Filer som vil bli endra
- `src/hooks/useFlightTimer.ts` – timeout, resync, realtime-lytting
- `src/pages/Index.tsx` – disabled/spinner på Avslutt-knapp, feil-toast
- `src/pages/Auth.tsx` – loop-vern + dedup toast

Ingen DB-migrasjonar nødvendige. Realtime på `active_flights` er allereie aktivt (brukt i `useDashboardRealtime`).

Sei frå viss du vil at eg skal implementere alle tre (A+B+C), eller berre nokre av dei.
