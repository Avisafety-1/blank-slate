# Utloggede besøkende skal alltid se innloggingssiden

## Problemet

Når du åpner en lenke rett til en underside (for eksempel avviks-lenken i e-posten) uten å være innlogget, viser appen i dag innholdet på siden med en gang — uten å sjekke om du er logget inn. For hendelsessiden ligger det en abonnementssjekk utenpå, og siden ingen bruker er kjent, antar den den laveste planen og viser «Oppgradering påkrevd» i stedet for innloggingssiden.

Andre sider sender deg riktignok videre til innlogging, men hver side gjør det på sin egen måte, og noen sider (blant annet oppdrag, kalender og endringslogg) mangler sjekken helt eller blinker først opp med innhold.

## Hva som endres

1. Alle innloggingskrevende sider får én felles portvakt. Er du ikke logget inn, sendes du rett til innloggingssiden — ingen innhold, ingen plan-melding vises først.
2. Adressen du prøvde å åpne huskes, og etter innlogging kommer du rett til den siden (for eksempel avviket fra e-posten).
3. Plan-sjekken («Oppgradering påkrevd») kjører først etter at portvakten har bekreftet at du er innlogget, slik at meldingen bare kan dukke opp for faktisk innloggede brukere.
4. Mens innloggingen fortsatt sjekkes vises en enkel lasteindikator, ikke en feilmelding — så en normal oppdatering av siden ikke kaster deg ut.

## Sider som gjennomgås

Forside, ressurser, vedlikehold, kart, dokumenter, kalender, hendelser, status, oppdrag, endringslogg, admin, statistikk og markedsføring. Åpne sider (innlogging, tilbakestill passord, priser, SORA-prosess, bruksanvisning, nyhetsbrev, installer, OAuth-samtykke) forblir åpne uten innlogging.

## Teknisk

- Ny `RequireAuth`-komponent i `src/components/RequireAuth.tsx`:
  - Leser `user`, `loading`, `authInitialized`, `authRefreshing` fra `AuthContext`.
  - Venter (viser `LoadingSpinner`) til auth er initialisert, og redirecter ikke under `authRefreshing` eller offline.
  - Uten bruker: `<Navigate to={"/auth?next=" + encodeURIComponent(pathname + search)} replace />`. `Auth.tsx` støtter allerede `?next=`-parameteren.
- `src/App.tsx`: legg `RequireAuth` innerst i `AuthenticatedLayout` rundt `MfaGate`/`SubscriptionGate`/`Outlet`, og pakk også de tre frittstående rutene `/admin`, `/statistikk`, `/marketing` i `RequireAuth`.
- Rekkefølgen blir `RequireAuth` → `MfaGate` → `SubscriptionGate` → `TrainingModuleRestricted` → `PlanRestricted` → side, slik at `PlanRestricted` aldri kan rendre for en anonym besøkende.
- Rydd bort de nå overflødige per-side `navigate("/auth")`-effektene i sidene som har dem, slik at redirect-logikken finnes ett sted (unngår dobbel-redirect og blink).
- Verifiseres med typecheck og med Playwright mot `/hendelser`, `/status`, `/oppdrag`, `/kalender`, `/admin` i utlogget nettleserøkt: alle skal ende på `/auth?next=…`.
