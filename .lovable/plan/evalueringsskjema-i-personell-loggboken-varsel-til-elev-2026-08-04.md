# Evalueringsskjema i personell-loggboken + varsel til elev

## Mål
1. Ny fane "Evalueringsskjema" i loggbok-dialogen for en person — kun synlig når personen faktisk har evalueringer.
2. Når instruktør trykker "Lagre" (fullfør) på et evalueringsskjema, sendes en melding til elevens innboks med deeplink til skjemaet.

## 1. Ny fane i loggboken
- I loggbok-dialogen hentes evalueringer der personen er elev (`student_id`), sortert nyest først.
- Fanen vises kun hvis listen har minst én oppføring (samme mønster som antall-visning på "Logginnlegg").
- Hvert kort viser: oppdragsnavn, dato for evaluering, instruktørnavn, snittscore og status (utkast/fullført).
- Klikk på kortet åpner evalueringsskjemaet i lesemodus (samme dialog som brukes fra oppdraget). Er brukeren elev og skjemaet fullført, er det skrivebeskyttet.
- Tilgangsreglene fra synlighetsseksjonen gjelder uendret: databasen returnerer kun rader brukeren har lov til å se, så en elev ser ikke utkast.

## 2. Melding til elev ved lagring
- Når instruktøren fullfører (status = completed) og det finnes en elev, sendes en intern melding til eleven:
  - Emne: oppdragets navn
  - Tekst: "Du har fått en ny evaluering på oppdrag «xxx». Skjemaet kan også finnes i din loggbok."
  - Deeplink som åpner skjemaet direkte.
- Sending skjer etter vellykket lagring og skal aldri blokkere lagringen hvis meldingen feiler (kun logges).
- Sendes ikke ved lagring av utkast, og ikke hvis eleven er samme person som instruktøren.

## 3. Deeplink til skjemaet
- Lenkeformat: `/oppdrag?id=<oppdragsId>&evaluation=<evalueringsId>`.
- Oppdragssiden leser allerede `id` fra URL; utvides til også å åpne evalueringsdialogen når `evaluation` er satt.
- Har brukeren ikke tilgang, vises den eksisterende låste tilstanden i stedet for feilmelding.

## Teknisk
- Filer: `src/components/FlightLogbookDialog.tsx` (ny fane + spørring mot `evaluation_responses`), `src/components/evaluation/EvaluationResponseDialog.tsx` (kall til meldingsutsending etter `save("completed")`), ny hjelpefil `src/lib/evaluationNotification.ts` (bygget over samme `send-message`-mønster som `missionMentionThread.ts`), `src/pages/Oppdrag.tsx` (håndtere `evaluation`-parameter).
- Ingen databaseendringer: eksisterende RLS på `evaluation_responses` styrer synligheten, og `student_id` finnes allerede.
- i18n: alle nye strenger legges i både `no.json` og `en.json` (fanenavn, tomtilstand, statusetiketter, meldingstekst).
