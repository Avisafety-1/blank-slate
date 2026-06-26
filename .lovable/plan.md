## Plan

1. **Flytt angre-ansvaret til kartkomponenten**
   - `OpenAIPMap` har allerede en intern historikk (`routeHistoryRef`) som lagrer ruten før hver mutasjon.
   - Eksponer en liten `undoToken`/trigger-prop fra `Kart.tsx` til `OpenAIPMap`, slik at toolbar-knappen kan be kartet kjøre `undoLastPoint()`.

2. **Fjern gammel pop-logikk i `/kart`**
   - Erstatt `handleUndoPoint`, som i dag gjør `slice(0, -1)`, fordi den alltid fjerner punktet med høyest nummer.
   - Den skal i stedet bare trigge kartets historikk-baserte angre.

3. **Bevar korrekt state i parent**
   - Når kartet angrer, skal `OpenAIPMap` fortsatt kalle `onRouteChange` med hele gjenopprettede ruten, total distanse og areal.
   - Da oppdateres `currentRoute`, SORA-panel, lagring og statistikk som før.

4. **Oppdater tekst/tilstand på knappen**
   - Endre tooltip fra `Angre siste punkt` til `Angre siste endring`.
   - Knappen kan fortsatt være disabled når ruten er tom.

5. **Verifiser manuelt i preview**
   - Lag punkt 1, 2, 3.
   - Klikk mellom 1 og 2 for å sette inn et nytt punkt.
   - Klikk Angre og bekreft at det innsatte punktet fjernes, ikke punktet med høyest nummer.