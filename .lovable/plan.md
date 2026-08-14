# Tilgangsregler — oversiktskort i admin

En ny knapp «Tilgangsregler» i admin som åpner en pen, tabbet dialog som forklarer hvem som kan gjøre hva i AviSafe. Ren dokumentasjon/visning — ingen endring av faktiske rettigheter. Superadmin-rettigheter nevnes ikke.

## Plassering

Knapp «Tilgangsregler» (skjold-ikon, `variant="outline"`, `size="sm"`) i handlingsraden på kortet «Godkjente brukere», til venstre for søkefeltet. Synlig for admin (samme sted som resten av brukeradministrasjonen). På mobil vises kun ikonet.

## Dialogen

Bred dialog (`max-w-4xl`, scrollbar innhold) med 6 faner. Gjennomgående visuelt språk:
- Rolle-/rettighetsbadges med semantiske farger (rolle = primary, rettighet = accent, arv fra morselskap = muted).
- Hver regel som en rad: hvem (badge) → hva de kan gjøre (kort setning), gruppert i små kort med ikon og tittel.
- Kort «info»-linje øverst i hver fane som forklarer prinsippet i én setning.

### Fane 1: Roller
- Nivåene **Bruker** og **Administrator** (administrator arver alt en bruker kan).
- Bruker: se og jobbe med eget selskaps data, opprette oppdrag, logge flytid, rapportere hendelser.
- Administrator: brukeradministrasjon, roller, selskapsinnstillinger, ressurser, dokumenter, sletting/redigering av andres loggbokoppføringer.
- Viktig poeng: rollen er grovkornet — de fleste spesialrettigheter gis per bruker (fane 2).

### Fane 2: Rettigheter (per bruker)
Tabell-lignende liste over profilflagg og hva de gir:
- **Kan godkjenne oppdrag** + omfang (eget selskap / valgte avdelinger / «alle avdelinger»). Selvgodkjenning kan blokkeres av selskapsinnstilling når brukeren selv står som personell på oppdraget.
- **Hendelsesansvarlig** + hvilke selskaper vedkommende kan settes ansvarlig for.
- **ECCAIRS-tilgang** — rapportering til myndighet.
- **Teknisk ansvarlig** — kan settes som teknisk ansvarlig på en drone.
- **Under opplæring / modultilgang** — begrenser hvilke moduler brukeren ser til opplæringen er bestått.
Presisering: en vanlig bruker kan ha disse rettighetene uten å være administrator.

### Fane 3: Selskap og avdelinger
- Hierarkiet morselskap → avdelinger.
- Admin i morselskapet kan se og administrere avdelingene sine; admin i en avdeling ser kun sin egen.
- Brukere med tilgang til flere selskaper kan bytte selskap i toppmenyen.
- **Propagering av innstillinger**: morselskapet kan låse innstillinger for alle avdelinger. Liste med de faktiske propagerings-bryterne i klartekst: oppdragsgodkjenning, blokkering av selvgodkjenning, SORA (krav, konfigurasjon, godkjenning, buffermodus), oppdragstyper og -roller, luftromsvarsler, flyvarsler, avvikskategorier, standard kartlag, skjuling av rapportøridentitet, kvittering på vedlikehold, currency-krav, FH2-nøkler.
- **Synlighet per avdeling** for dokumenter, droner og utstyr — standard er alle avdelinger, kan begrenses til utvalgte.

### Fane 4: Data og innhold
- **Evalueringsskjema**: synlig for eget selskap; kun opprettet/redigert fra admin; global synlighet er ikke tilgjengelig for vanlige administratorer.
- **Flyturer og loggbok**: administrator kan redigere og slette flyturer og loggbokoppføringer; en bruker kan redigere sine egne. Sletting av en flytur fjerner også tilhørende loggbokoppføringer og trekker fra flytimer.
- **Dokumenter og sjekklister**: synlig for eget selskap, evt. arvet fra morselskap når det er delt til avdelinger.
- **Oppdrag**: synlig for eget selskap, og for personell som er tildelt oppdraget på tvers av avdelinger.
- **Meldinger**: kun avsender og mottakere ser en tråd.

### Fane 5: Godkjenning
- Flyten for oppdrag: utkast → venter på godkjenning → godkjent/avvist, og hvem som kan trykke godkjenn (rettighet + omfang + eventuell selvgodkjenningssperre).
- Når selskapet krever SORA: oppdraget kan ikke godkjennes før påkrevde SORA-steg er fullført.
- Hendelser: hendelsesansvarlig behandler; rapportørens identitet skjules når hendelsen er anonym eller selskapet skjuler identitet — kun admin i morselskapet med avdelinger ser identiteten.

### Fane 6: Abonnement og opplæring
- Funksjoner kan være låst av abonnementsplanen (og eventuelle tillegg); selskaper med fritak er ikke plangatet.
- Opplæringsmodus låser moduler til kurs er bestått — gjelder kun brukere merket som under opplæring.

## Teknisk

- Ny komponent `src/components/admin/AccessRulesDialog.tsx` med `Dialog` + `Tabs` (shadcn), og en liten intern `RuleRow`/`RuleCard`-hjelper for konsistent oppsett. Innholdet er statisk, datadrevet fra en array-struktur i filen slik at det er enkelt å vedlikeholde.
- Kun semantiske tokens (`primary`, `muted-foreground`, `accent`, `border`) — ingen hardkodede farger.
- All tekst via `t()` med nye nøkler under `admin.accessRules.*` i både `src/i18n/locales/no.json` og `en.json`.
- Knappen legges inn i handlingsraden i `src/pages/Admin.tsx` (kortet «Godkjente brukere»), med lokal `open`-state.
- Ingen databaseendringer, ingen endring i eksisterende tilgangslogikk.
