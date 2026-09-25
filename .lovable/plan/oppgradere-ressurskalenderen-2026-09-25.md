# Oppgradere ressurskalenderen

## Mål
Bygge den valgte «Professional operational timeline»-retningen som en tett, presis AviSafe-oversikt, inspirert av 21st.dev-referansen. Dagens data, dialoger og tilgangsregler beholdes.

## Dette bygges
- Erstatte de separate seksjonskortene med én sammenhengende ukestidslinje for droner, personell, utstyr og kalenderoppføringer.
- Feste ressurskolonnen til venstre og uke-/dagshodet øverst, slik at navn og tid alltid er synlige ved scrolling.
- Gi hver ressursgruppe en kompakt skillelinje og ikon, uten kort-i-kort-oppsett.
- Vise oppdrag, vedlikehold og kalenderoppføringer som varighetsblokker med tittel og klokkeslett; korte blokker får lesbar detaljvisning ved peker eller trykk.
- Beholde tydelig konfliktmarkering og åpning av eksisterende oppdrags- og vedlikeholdsdetaljer.
- Legge til en zoomkontroll for tetthet/tidsbredde, med horisontal scrolling når hele uken ikke får plass.
- Fremheve dagens kolonne og nåværende tidspunkt når valgt uke er inneværende uke.
- Tilpasse oppsettet for mobil med smal, festet ressurskolonne og berøringsvennlig navigasjon.

## Visuell retning
- AviSafe-operativ palett med mørke, nøytrale flater og semantiske grønne/gule varsler.
- Space Grotesk for overskrifter og DM Sans for øvrig tekst.
- Kompakt, profesjonell flyoperativ stil med høy kontrast, tynne rutenett og begrenset dekor.
- Alle farger legges som semantiske designtokens og fungerer i både lys og mørk modus.

## Avgrensning
- Ingen databaseendringer.
- Ingen dra-og-slipp eller endring av tidspunkt/ressurstildeling i denne oppgraderingen; kalenderen forblir en sikker oversikt.
- Eksisterende ukefiltrering, datakilder, dialoger og klikkhandlinger beholdes.
- Alle nye brukerstrenger legges i både norsk og engelsk oversettelse.

## Teknisk gjennomføring
- Omstrukturere `ResourceTimeline` til en felles skalerbar tidsflate med stabil rad- og kolonnekonstruksjon.
- Bruke eksisterende knapp-, dialog-, tooltip- og sliderkomponenter samt eksisterende datahenting.
- Legge typografi og nye kalenderroller i det globale designsystemet fremfor hardkodede komponentfarger.
- Kontrollere tom-, laste-, overlapp- og smale skjermtilstander.

## Kontroll
- Kjøre `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
- Kontrollere ressurskalenderen visuelt på desktop og mobil, inkludert zoom, scrolling, konflikter og detaljåpning.
