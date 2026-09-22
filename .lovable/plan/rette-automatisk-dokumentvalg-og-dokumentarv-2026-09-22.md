# Rette automatisk dokumentvalg og dokumentarv

## Bekreftede funn
- «avisafe logo med tekst hvit (1).png» er registrert som koblet til DJI FlyCart 100 med serienummer `123456` i Avdeling Bergen, selv om dette ikke er ønsket.
- Ved opprettelse av et oppdrag henter skjemaet dokumenter fra **alle droner den innloggede brukeren er tilknyttet**, ikke bare fra dronene som faktisk er valgt i oppdraget. Dette kan gi uventede dokumenter.
- Avdeling Bergen arver oppdragstypene fra Moderavdeling.
- Moderavdelingens oppdragstype «Test arv» peker på dokumentet «Risk assessment - Sar demo 1 - 24.07.2026», men dokumentet er ikke delt med Avdeling Bergen. Oppdragsskjemaet får derfor dokument-ID-en uten å kunne hente dokumentet, som forklarer den tomme dokumentbrikken i skjermbildet.

## Endringer

1. **Rydd den feilaktige logo-koblingen**
   - Fjern den konkrete koblingen mellom «avisafe logo med tekst hvit (1).png» og FlyCart 100 (`123456`) i Avdeling Bergen.
   - Behold selve dokumentet og alle andre koblinger urørt.

2. **Knytt automatiske dokumenter til faktisk valgte droner**
   - Slutt å hente dokumenter fra alle droner brukeren er tilknyttet når oppdragsskjemaet åpnes.
   - Hent og legg til drone-dokumenter når en drone velges i oppdraget.
   - Fjern bare dokumenter som kom automatisk fra en drone når dronen fjernes, og behold dokumentet dersom det også kommer fra en annen valgt drone, oppdragstypen eller manuelt valg.
   - Spor kilden til automatiske valg internt slik at manuelle dokumentvalg aldri fjernes ved en feil.

3. **Legg inn avdelingsvalg når dokument kobles til en arvet oppdragstype**
   - Når en administrator i en moderavdeling kobler et dokument til en oppdragstype som gjelder for avdelinger, vis en dialog med «Gjør dokumentet synlig for avdelinger».
   - Vis underavdelingene som avkryssingsvalg, forhåndsvalgt for alle avdelinger som arver oppdragstypene.
   - Lagre valgene med det eksisterende systemet for dokumentdeling per avdeling.
   - Dersom dokumentet allerede er synlig for alle underavdelinger, vis dette uten å opprette duplikater.

4. **Gjør arvede dokumenter robuste i oppdragsskjemaet**
   - Automatisk legg til oppdragstypens dokument bare når brukeren faktisk har tilgang til dokumentet.
   - Ikke vis tomme dokumentbrikker dersom en gammel kobling peker til et utilgjengelig eller slettet dokument.
   - Sørg for at dokumentet blir synlig og automatisk valgt i Avdeling Bergen etter at delingen er lagret.

5. **Rydd eksisterende arvet testdata**
   - Del det eksisterende dokumentet på oppdragstypen «Test arv» med de aktuelle underavdelingene, slik at eksisterende oppsett fungerer uten at dokumentet må kobles på nytt.

## Tekst og kvalitet
- Legg all ny tekst i både norsk og engelsk språkfil.
- Test oppretting av oppdrag med og uten valgt drone, fjerning/bytte av drone, manuelt valgte dokumenter og arvet oppdragstype i Avdeling Bergen.
- Kontroller at dokumentdeling fortsatt følger selskaps- og avdelingstilgangen.
- Valider med `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.

## Teknisk
- Bruk eksisterende `document_department_visibility`; ingen ny tabell er nødvendig.
- Datarydding utføres målrettet på de bekreftede koblingene, uten å endre historiske oppdrag.
