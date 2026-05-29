## Mål

Rydde opp i visningen av "Godkjente brukere" på admin-siden slik at den ser bra ut i det smale formatet som vises på DJI RC Pro-kontrolleren (tablet-bredde rundt 768–1024 px). Navnet skal alltid være synlig, og datafeltene/bryterne skal være ryddig organisert i stedet for å flyte i flere rader.

## Hva som er problemet

På smal/tablet-bredde brukes den brede desktop-layouten, der navn legges i en flex-rad sammen med 4–5 brytere, avdelingsvelger, rollevelger og slett-knapp. Bryterne wrapper rotete, dekker delvis brukerens navn, og kolonnene står ikke på linje mellom rader.

## Endring

Kun i `src/pages/Admin.tsx`, listen "Godkjente brukere":

1. La den eksisterende "kompakt"-visningen (popover med detaljer bak navn) brukes på et bredere område, slik at DJI RC Pro-formatet (~1024 px) får den ryddige varianten. Justere `isCompactAdmin`-bryterpunktet oppover, f.eks. til `max-width: 1439px`, så desktop-grid kun brukes på faktiske store skjermer.
2. I selve rad-renderingen for kompakt-visning: sørge for at navn + e-post + avdelings-badge alltid står som tydelig venstrekolonne, og at en liten "Detaljer"-knapp åpner popoveren med brytere/rolle/slett — i stedet for at noen brytere prøver å vises inline.
3. I popover-innholdet: gruppere bryterne med små overskrifter ("Tilganger", "Avdeling", "Rolle", "Fjern bruker") slik at det ikke ser ut som en blandet liste.
4. Sørge for at slett-knappen ikke står inline ved siden av navnet i kompakt-modus (den hører hjemme i popoveren), så ingenting skyver navnet ut av syne.

Ingen endringer i logikk, datahenting, edge-funksjoner eller andre filer.

## Verifisering

Bekrefte i preview på 768–1024 px bredde at:
- Navn og e-post er fullt synlig på alle rader.
- Detaljer/brytere ligger bak en knapp/popover, ikke wrapper rotete.
- Bredere skjerm (>1440 px) fortsatt får den eksisterende brede raden uendret.