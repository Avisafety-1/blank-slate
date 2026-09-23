# Beregningsgrunnlag for buffersoner i oppdragsrapporten

## Mål
Under «SORA buffer og tilstøtende områder» i PDF-rapporten skal det stå hvilke verdier og metoder som faktisk ble brukt til å beregne Flight Geography, contingency buffer/høyde og Ground Risk Buffer.

## Bekreftet beregningsgrunnlag
- **Flight Geography:** dronens karakteristiske dimensjon (CD), beregnet som minst `3 × CD`.
- **Contingency buffer:** luftfartøytype, bakkehastighet V0, reaksjonstid, pitch/bank-vinkel, GNSS-feil, posisjonsholdefeil og kartfeil.
- **Contingency høyde:** flyhøyde, høydemålerfeil, V0, reaksjonstid og manøverberegningen.
- **Ground Risk Buffer:** valgt GRB-metode, total høyde og `CD / 2`. Ballistisk metode bruker også V0; glide bruker glidetall; drift bruker vind og synkehastighet; 1:1 bruker ingen vindverdi.
- **Fallskjerm/FTS-metode:** bruker utløsingstid i stedet for pitch/bank-basert manøverdistanse.
- Dronens **MTOW** lagres i beregningsprofilen, men inngår ikke i dagens bufferformler og skal derfor ikke feilaktig oppgis som beregningsgrunnlag.

## Endringer
1. Utvide rutedataene som lagres med oppdraget, slik at de effektive verdiene brukt i beregningen følger oppdraget: luftfartøytype, reaksjonstid, pitch/bank, måle-/posisjonsfeil, contingency-metode, GRB-metode og de metodeavhengige verdiene for utløsingstid, glidetall, vind og synkehastighet.
2. Lagre beregningsdetaljene fra samme kalkulator som produserer bufferavstandene, inkludert reaksjons- og manøverdistanse, høydebidrag og total beregningshøyde. Dermed dokumenterer PDF-en den historiske beregningen og ikke senere endringer i dronekatalogen.
3. Utvide buffersonedetaljene i PDF-en med en tydelig del «Beregningsgrunnlag». Bare relevante felt vises:
   - alltid: drone, luftfartøytype, CD, V0, flyhøyde, reaksjonstid, contingency-metode, GRB-metode og relevante feilmarginger;
   - fallskjerm/FTS: utløsingstid;
   - glide: glidetall;
   - drift: vind og synkehastighet;
   - ballistisk: V0 og total beregningshøyde;
   - 1:1: total beregningshøyde og CD-bidrag.
4. Vise delresultater som gjør sluttverdiene etterprøvbare: reaksjonsdistanse, manøverdistanse, contingency-høydemargin, total høyde og beregnet GRB.
5. Beholde støtte for eldre oppdrag. Der eldre rutedata mangler detaljer, vises bare lagrede verdier og kjente standardverdier merkes som standard; rapporten skal ikke late som ukjente historiske verdier er dokumentert.
6. Legge alle nye betegnelser og metodenavn i både norsk og engelsk PDF-oversettelse.

## Teknisk omfang
- Oppdater `SoraSettings` og lagringen fra SORA-panelet, uten databaseendring; verdiene ligger i oppdragets eksisterende rute-JSON.
- Oppdater PDF-tabellen i `oppdragPdfExport.ts` og gjenbruk resultatet fra `calculateSoraBuffer` fremfor å lage en ny formel i PDF-koden.
- Ingen endring av selve bufferformlene eller kartgeometrien.

## Kontroll
- Test alle GRB-metoder (`av`, `1:1`, `ballistisk`, `glide`, `drift`) og begge contingency-metoder.
- Kontroller nytt og eldre oppdrag, manuell overstyring og manglende katalogverdier.
- Kjør `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
- Generer representative rapporter, konverter PDF-sidene til bilder og kontroller visuelt sidebrudd, tabellbredder, tegn og lesbarhet.
