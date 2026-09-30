# Én aktiv flygning om gangen på dashbordet

## Resultat
- «Aktive flyturer» viser én hel flygning av gangen. Flere samtidige flygninger ligger i samme felt og kan rulles fram uten at feltet vokser og skyver kalender, oppdrag eller andre widgeter nedover.
- En liten pil i overskriften vises når det finnes flere flygninger. Den viser at listen kan rulles, og kan trykkes for å gå videre til neste flygning. Ved slutten kan man gå tilbake.
- Antallsmerket og dagens handlinger på flygningen beholdes.

## Teknisk gjennomføring
- Begrens høyden til flygningslisten i `ActiveFlightsSection` til én full flygningsrad, med plass til selskapslinjen der den vises. Bruk intern rulling og la overskrift/pil ligge fast utenfor rulleområdet.
- Legg pilen i eksisterende overskriftsrad, slik at flere flygninger ikke endrer widgetens ytre høyde. Sørg for at pilen kan brukes med tastatur og har tilgjengelig navn på norsk og engelsk.
- Kontroller én og flere flygninger samt smal og bred skjerm; sjekk at bunnen av dashbordets widgeter ikke flytter seg når antallet øker. Kjør prosjektets relevante kontroller. Ingen database- eller e-postendringer.
