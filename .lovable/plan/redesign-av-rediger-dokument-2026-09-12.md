# Redesign av «Rediger dokument»

## Mål
Gjøre den eksisterende dokumentdialogen mer handlingsorientert uten å endre dagens dokumentflyt. De viktigste filhandlingene flyttes øverst, mens metadata beholdes i én ryddig kolonne.

## Valgt retning
- «Action-centric dialog» med Avisafe-blå fargebruk.
- Presis og kompakt typografi i tråd med prosjektets eksisterende stil.
- Tre store, like brede handlinger øverst: **Åpne**, **Last ned** og **Oppdater**.
- Mobil og iPad får en stabil oppbygning uten horisontal forskyvning; knappene tilpasses smale skjermer.

## Endringer
1. **Ny handlingsrad øverst**
   - «Åpne» åpner eksisterende dokument med dagens sikre lenkeflyt.
   - «Last ned» henter samme dokument som en faktisk nedlasting.
   - «Oppdater» åpner filvelgeren og erstatter dagens separate «Oppdater dokument»-felt.
   - Handlinger som ikke er tilgjengelige for dokumentet skjules eller deaktiveres tydelig.

2. **Behold eksisterende oppdateringslogikk**
   - Valgt erstatningsfil vises tydelig under handlingsraden med mulighet for å fjerne valget.
   - Filen lastes først opp når brukeren lagrer, slik dialogen fungerer i dag.
   - Ny fil øker versjonsnummeret og viser eksisterende beskjed om ny versjon.
   - Versjonsforhåndsvisningen skal bruke samme funksjon som lagringen, slik at tallene ikke kan avvike.

3. **Ryddigere innhold**
   - Fjern det gamle filopplastingsfeltet og den gjentakende «Åpne eksisterende fil»-lenken.
   - Behold kategori, tittel, beskrivelse, utløpsdato, varslingsdager, nettadresse og synlighet/deling i én kolonne.
   - Behold «Slett», «Avbryt» og «Lagre» nederst med dagens rettigheter og bekreftelser.
   - Oppretting og skrivebeskyttet visning skal fortsatt fungere uten å vise irrelevante redigeringshandlinger.

4. **Språk og tilgjengelighet**
   - Legg alle nye tekster og tilstander til både norsk og engelsk oversettelse.
   - Bruk eksisterende knapper, ikoner, fokusmarkering og semantiske fargetokens.
   - Gi ikonhandlingene tydelige navn og støtte tastaturbruk.

## Berørte steder
- Dokumentdialogen som brukes fra Dokumenter og Kalender.
- Norske og engelske oversettelser for dokumentdialogen.
- Ingen database- eller lagringsendring er nødvendig.

## Verifisering
- Kontroller åpning og nedlasting av både lagrede filstier og direkte nettlenker.
- Kontroller at «Oppdater» velger fil, at avbryt ikke laster opp, og at lagring erstatter filen og øker versjonen én gang.
- Kontroller metadataredigering uten filbytte, sletting og tilgangsstyrte tilstander.
- Test dialogen på telefon-, iPad- og desktopbredde, inkludert lange filnavn.
- Kjør typekontroll og relevante tester.
