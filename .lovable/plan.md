# Hvorfor filer havner i feil mappe – og hvordan vi retter det

## Hva jeg fant

Hver fil lagres i en mappe oppkalt etter et selskap. Det er to steder man kan laste opp en fil, og de velger mappe på hver sin måte:

1. Dialogen for å laste opp nytt dokument legger filen i mappen til **selskapet du står i akkurat nå** – ikke i mappen til avdelingen dokumentet tilhører. Står en Tensio-administrator og legger inn et dokument som eies av Tensio Nord, havner filen i Tensio sin mappe.
2. Dialogen for å redigere/erstatte fil på et eksisterende dokument legger filen **helt uten mappe**, rett i «roten» av arkivet.

Begge deler gjør at mappen ikke samsvarer med dokumentets eier. Det er akkurat de 16 tilfellene vi så: 9 Tensio Nord-dokumenter i Tensio sin mappe, 6 Avisafe-dokumenter i andre mapper, og 1 fil helt uten mappe.

Tilgangsregelen som ble lagt inn i går gjør at disse likevel kan åpnes, så ingen er blokkert nå. Men så lenge opplastingen fortsetter å velge feil mappe, vokser rotet videre.

## Hva som skal gjøres

### 1. Opplasting velger riktig mappe
- Ved nytt dokument: bruk mappen til avdelingen dokumentet registreres på, ikke selskapet brukeren står i.
- Ved redigering/erstatning av fil: bruk mappen til avdelingen som eier dokumentet, i stedet for å lagre uten mappe.
- Filnavnet holdes unikt som i dag.

### 2. Rydde opp i de 16 eksisterende
Flytte hver fil til riktig avdelings mappe og oppdatere dokumentets filhenvisning i samme operasjon, slik at ingenting blir liggende uten kobling. Gjøres kontrollert, ett dokument av gangen, med kontroll av at filen kan åpnes etterpå.

### 3. Ikke endret
Nivåene for deling nedover beholdes som i dag (morselskap til direkte underavdelinger). Tilgangsregelen fra i går beholdes uendret – den fungerer også som sikkerhetsnett mot eldre feilplasserte filer.

## Teknisk

- `src/components/documents/DocumentUploadDialog.tsx`: `filePath` bygges av `companyId` fra kontekst; skal bruke valgt eier-avdeling for dokumentraden.
- `src/components/documents/DocumentCardModal.tsx`: `uploadFile()` returnerer `${fileName}` uten prefiks; skal prefikses med dokumentets `company_id` (eksisterende dokument) eller `companyId` (nytt).
- Opprydding: kopier objekt i `documents`-bucket til `<company_id>/<filnavn>`, oppdater `documents.fil_url`, slett gammelt objekt. Kjøres som skript/edge-kall med service role, ikke som SQL-migrasjon (storage-objekter kan ikke flyttes i SQL).
- `public.can_read_document_file(text)` og SELECT-policyen på `storage.objects` røres ikke.
