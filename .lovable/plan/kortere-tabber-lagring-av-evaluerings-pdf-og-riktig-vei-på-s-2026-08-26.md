# Kortere tabber, lagring av evaluerings-PDF og riktig vei på signatur

Tre uavhengige forbedringer.

## 1. Kortere tabb-navn i loggbok-dialogen på mobil

I loggbok-dialogen ("Loggbok – <bruker>") er tabbene «Flyturer», «Logginnlegg (n)» og «Evalueringsskjema (n)». På mobil blir raden så bred at dialogen presses ut av skjermen.

- Bruk korte navn på mobil og fulle navn fra `sm:` og oppover:
  - Flyturer → «Flyturer»
  - Logginnlegg (n) → «Logg (n)»
  - Evalueringsskjema (n) → «Eval. (n)»
- Tabbene får `min-w-0`, mindre tekst/padding på mobil og trunkering, slik at raden aldri kan bli bredere enn dialogen.
- Tekstene legges inn som i18n-nøkler på norsk og engelsk (de er i dag delvis hardkodet norsk i komponenten).

## 2. Eksport lagrer skjemaet i /dokumenter (ingen nedlasting)

I dag laster PDF-eksporten filen ned lokalt.

- Eksport laster ikke lenger ned filen. PDF-en genereres og lastes opp til `documents`-bucketen på samme sti-mønster som vanlig dokumentopplasting (`<company_id>/<timestamp>.pdf`), og det opprettes en rad i `documents` med:
  - tittel = skjemanavn + elevnavn/dato
  - kategori = eksisterende `vurderingsskjema`
  - synlighet satt likt som valgene i eksport-dialogen (ingen global synlighet)
- Knappen får tekst «Lagre som PDF i Dokumenter», og bekreftelsen sier at skjemaet ligger på /dokumenter og kan lastes ned derfra.
- PDF-genereringen endres til å returnere filen (blob) i stedet for å laste den ned.

Ingen databaseendring og ingen ny kategori.


## 3. Vise hva som er «opp» når man signerer

På mobil roteres signaturflaten 90° slik at man tegner sidelengs, men det er ingen indikasjon på hvilken vei som er opp – derfor kan signaturen bli lagret opp-ned.

- Legg inn en tydelig markering i selve signaturfeltet:
  - en stiplet signaturlinje med et lite «×»-kryss der signaturen skal starte
  - teksten «Topp / Top ↑» langs den kanten som er øverst i det ferdige bildet
  - en pil-ikon-hint i overskriften som viser hvilken vei telefonen skal holdes
- Markeringene tegnes som overlegg (ikke på canvas), så de blir ikke en del av det lagrede bildet.
- I tillegg kommer en «Snu 180°»-knapp i bunnraden, slik at man kan snu tegneretningen hvis man holder telefonen andre veien; knappen roterer tegneflaten og koordinat-omregningen tilsvarende.
- Alle nye tekster på norsk og engelsk.

## Teknisk

- `src/components/FlightLogbookDialog.tsx`: responsive tabb-labels.
- `src/lib/evaluationPdfExport.ts`: returnerer `Blob` + filnavn i stedet for nedlasting.
- `src/components/evaluation/EvaluationExportDialog.tsx`: opplasting til `documents`-storage + `documents`-insert med kategori `vurderingsskjema`.

- `src/components/SignatureDrawerDialog.tsx`: orienteringsoverlegg, baseline og «snu 180°»-tilstand som brukes i både rendering og `getCoordinates`.
- `src/i18n/locales/no.json` og `en.json`: nye nøkler.
