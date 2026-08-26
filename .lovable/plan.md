# Tilgangsstyring og PDF-eksport for evalueringsskjema

To ting: en "kun synlig for admin"-bryter på selve skjemamalen, og PDF-eksport av ferdige evalueringer med valg av hvem skjemaet er synlig for.

## 1. "Kun synlig for admin" på skjemamalen

I dialogen for å opprette/redigere evalueringsskjema (ved siden av dagens globale synlighet) kommer en ny bryter: **Kun synlig for admin**.

- Verdien lagres i malens struktur/metadata, slik at ingen databaseendring er nødvendig (feltet legges inn som et flagg i malens lagrede data).
- Når bryteren er på, blir malen på /dokumenter markert med et låsikon/badge.
- Brukere uten admin-rolle som prøver å åpne, forhåndsvise eller redigere malen får en toast/dialog: **"Du har ikke tilgang til dette dokumentet"** og dialogen åpnes ikke.
- Dette er bevisst kun frontend-blokkering (som ønsket) — ikke en sikkerhetsgrense.

## 2. PDF-eksport av utfylt evaluering

På et lagret/ferdigstilt evalueringsskjema (signatur ikke påkrevd) kommer en **Eksporter PDF**-knapp i dialogen.

Ved klikk åpnes en liten eksportdialog der man velger synlighet før nedlasting:

- Kun admin
- Valgte personer (søkbar liste over personer i selskapet)
- Eleven har alltid tilgang — vises som fast, ikke-fjernbar oppføring

Valget lagres på evalueringen (bruker de eksisterende synlighetsfeltene `share_with_admins` og `extra_viewer_ids`), slik at eksportvalget og synligheten i appen holdes i synk. Deretter genereres PDF-en og lastes ned.

### PDF-innhold

- Tittel, beskrivelse, selskapslogo/topptekst i samme stil som øvrige eksporter
- Elev, instruktør, oppdrag og tidspunkt
- Alle kategorier/underkategorier med score 1–6 og kommentarer
- Totalsnitt og helhetlig kommentar
- Signatur (bilde, navn, tidspunkt) dersom eleven har signert — ellers "Ikke signert"
- Synlighetsoppsummering i bunnteksten

## Teknisk

- `EvaluationFormDialog.tsx`: ny admin-only-bryter, lagres via `useEvaluationTemplates` i malens data.
- `Documents.tsx` / kortlisting: låsbadge + tilgangssjekk mot rolle før visning/redigering, med feilmelding "Du har ikke tilgang til dette dokumentet".
- Ny `src/lib/evaluationPdfExport.ts` bygget på `createPdfDocument` i `src/lib/pdfUtils.ts` (Roboto-font, norske tegn).
- Ny liten `EvaluationExportDialog` som gjenbruker dagens synlighetsvelger fra `EvaluationResponseDialog.tsx`, lagrer valget og trigger eksporten.
- Alle nye strenger legges i både `no.json` og `en.json`.
- Ingen databaseendringer.
