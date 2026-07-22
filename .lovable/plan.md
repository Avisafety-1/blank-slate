## Bakgrunn

Fra `/maphelp` sier notaminfo selv:

> "The NOTAM information is collected by logging on to the **NATS** web site, and downloading all the information for the **EGTT and EGPX** flight Information Regions, ie the whole of the **UK**."

Dette betyr at notaminfo sin egen kildedata i utgangspunktet er UK-only (NATS AIS). At vi i dag får norske NOTAMs derfra tyder på at Dave har utvidet kildene sine noe, men det finnes ingen dokumentert måte å utvide RSS-boundary programmatisk — boundary er lagret per konto på serveren, og feed-URL-en (`?u=<brukernavn>`) plukker bare opp den lagrede boundary-en.

Sider som antyder mulige omgåelser:
- `Flight Planning Map` viser "the entire country, and all current NOTAMS" — én visning uten boundary-filter
- `Latest Briefing` viser den rå NATS-briefing-en som lastes ned time for time
- `Export NOTAMs` (i sidemenyen) og KML-nedlasting for innloggede brukere

Ingen av disse er dokumentert som API, men de eksisterer som endepunkter når man er logget inn.

## Plan

### Fase 1 — Reverse-engineer notaminfo (undersøkelse, ingen kode)

Manuell utforsking mot notaminfo med innlogget bruker for å svare på:

1. Har `Flight Planning Map` en underliggende JSON/XML-endpoint (DevTools → Network) som returnerer alle UK-NOTAMs uten boundary-filter?
2. Kan `Latest Briefing` hentes som strukturert tekst per FIR (f.eks. EGTT, EGPX, ENOR, ESAA)?
3. Har `Export NOTAMs`/KML et URL-mønster som kan parameteriseres med FIR eller boundary?
4. Hvilke FIR-er dekker notaminfo faktisk i dag (kun UK, eller også ENOR/ESAA/EKDK/EDGG/EFIN)?

Leveranse: kort notat med endepunkter, respons-format, og en go/no-go-anbefaling for å bygge en «notaminfo-scraper»-adapter.

### Fase 2 — Beslutningspunkt

Basert på funnene i Fase 1, velg én av:

- **2A**: Bygg `fetch-notams-notaminfo-scraper` som logger inn og henter Flight Planning Map / Latest Briefing / KML uten boundary — hvis endepunktene finnes og dekker de landene vi trenger.
- **2B**: Aksepter at notaminfo har hardt UK-tak (og delvis NO), og bygg `fetch-notams-autorouter` som europeisk hovedkilde. Behold notaminfo RSS som fallback for Norge for ikke å påvirke eksisterende brukere.
- **2C**: Kombinasjon: 2A for land der scraping fungerer, 2B for resten.

### Fase 3 — Implementasjon (kun etter godkjenning av Fase 2-valg)

Uansett valg: nye kilder skrives til `notams`-tabellen med samme deduplisering på `notam_id`. Ingen endring i `notam_rss_feeds`-flyten for norske brukere før parity er verifisert.

## Risiko og begrensninger

- **Notaminfo-scraping er skjør**: HTML/session-endringer kan bryte det uten varsel, og ToS på notaminfo tillater ikke eksplisitt automatisert nedlasting av briefings. Bør avklares med Dave (kontaktskjema) før produksjonssetting.
- **Notaminfo dekker sannsynligvis ikke DE/FI/SE/DK offisielt** — selv en perfekt scraper løser ikke det europeiske dekningsproblemet.
- **Autorouter** er en gratis, dokumentert, OAuth-basert API laget for nettopp dette formålet og gir hele ECAC — dette er den mest robuste veien til europeisk dekning uavhengig av notaminfo-utfallet.
- Norske brukere skal ikke merke noe før nye kilder er shadow-verifisert (samme mønster som airspace-utrullingen).

## Neste steg

Godkjenn Fase 1 (undersøkelse), så gjør jeg manuell DevTools-analyse mot notaminfo og rapporterer tilbake med endepunktene før vi velger 2A/2B/2C.
