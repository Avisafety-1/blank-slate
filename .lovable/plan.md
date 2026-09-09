# Verifisering av innloggingsvakten + to små sikringer

## Hva jeg har kontrollert

Endringen la til én felles portvakt foran alle innloggingskrevende sider, i tillegg til de sjekkene som allerede fantes på hver enkelt side.

Testet utlogget i nettleser: `/hendelser`, `/status`, `/oppdrag`, `/kalender`, `/admin`, `/dokumenter`, `/kart` og forsiden sender alle rett til innloggingssiden med den opprinnelige adressen bevart. `/priser` er fortsatt åpen, som før. Kodekontrollen passerer.

**Endret jeg noe som allerede virket?** Nei, oppførselen utad er den samme for de sidene som allerede sendte deg til innlogging (blant annet oppdrag, vedlikehold, kart, status, dokumenter, ressurser, admin). Disse hadde hver sin egen sjekk, og de er beholdt uendret. Det nye er at sjekken nå skjer *før* siden i det hele tatt bygges opp, slik at hendelser (og andre sider med plan-sperre) ikke lenger rekker å vise «Oppgradering påkrevd» til utloggede.

**Bakvei uten innlogging?** Nei. Portvakten er kun et visningsvalg; all data er uansett beskyttet i databasen per selskap og bruker. En utlogget person får ingen data selv om en side skulle rendres.

## To svakheter jeg fant, som bør sikres

1. **Mulig evig lasteskjerm.** Hvis du logger ut akkurat mens appen holder på å hente profilen din, blir en intern «henter»-tilstand hengende. Da vil den nye vakten vise en spinner i stedet for innloggingssiden. Sjelden, men det er nettopp typen utlåsing du vil unngå.

2. **Innlogging via login.avisafe.no.** Hvis noen kommer inn på login-domenet med en dyplenke, sendes de etter innlogging videre på samme domene i stedet for til app-domenet.

## Det jeg vil gjøre

- Nullstille «henter»-tilstanden ved utlogging, og legge inn en sikkerhetsventil i portvakten: om lasteskjermen varer mer enn noen få sekunder uten innlogget bruker, sendes man til innloggingssiden i stedet for å bli stående.
- Sende brukeren til app-domenet etter innlogging når dyplenken ble åpnet på login-domenet.
- Kjøre kodekontroll på nytt og gjenta nettlesertesten utlogget på alle sidene, samt sjekke at innlogget bruker ikke blir kastet ut ved oppfriskning av siden.

## Teknisk

- `resetAuthState()` i `AuthContext` setter ikke `authRefreshing = false`; `clearLocalAuthData()` og `signOut()` kan derfor etterlate `authRefreshing: true` med `user: null`, og `RequireAuth` blir stående på `LoadingSpinner`. Legger `setAuthRefreshing(false)` i `resetAuthState`, og en `useEffect`-basert timeout (ca. 6 s) i `RequireAuth` som faller gjennom til redirect.
- `getNextTarget()` i `Auth.tsx` returnerer relativ sti og `window.location.assign` beholder derfor origin. Bruker `getAppUrl(next)` fra `src/config/domains.ts` i de to redirect-punktene, slik at man alltid ender på app-domenet i produksjon (uendret i dev).
- Ingen endring i RLS, ruteliste eller de eksisterende per-side-redirectene.
