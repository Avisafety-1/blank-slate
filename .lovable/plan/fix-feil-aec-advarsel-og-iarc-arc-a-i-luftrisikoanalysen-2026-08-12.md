# Fix: feil AEC-advarsel og «iARC: ARC-a» i luftrisikoanalysen

## Hva som faktisk er galt

Hjelpefunksjonen som normaliserer en ARC-tekst (`normalizeArc` i `src/lib/soraAirRisk.ts`) leter etter første bokstav a/b/c/d i strengen. Siden strengen starter med «ARC-», treffer den alltid `a` i selve ordet «arc». Resultatet: **enhver ARC blir tolket som ARC-a**.

Det gir nøyaktig de to symptomene du ser på TRST SORA-oppdraget:

1. AEC 9 gir ARC-c i Annex C tabell 1, men lagret iARC «ARC-c» ble lest som «ARC-a» → systemet trodde AEC og iARC var i konflikt og viste advarselen «AEC-en stemmer ikke med Annex C-tabellene».
2. Fallback-linjen viste da residual ARC — også feiltolket som ARC-a — mens toppen viser den ekte verdien ARC-c. Derav «ARC-c» i header og «iARC: ARC-a» under.

AEC 9 er altså riktig; det er kun parsingen som er feil.

## Endringer

1. `src/lib/soraAirRisk.ts`: rett `normalizeArc` til å matche mønsteret `arc-?\s*([abcd])` (samme som `arcRank` allerede gjør), med fallback for en enslig bokstav. Da returneres ARC-b/c/d korrekt.
2. Gå gjennom `AirRiskAnalysisSection.tsx` og gjør presentasjonen logisk konsistent:
   - iARC-linjen viser alltid den initielle ARC som følger av AEC-tabellen (eller operatørens erklæring), aldri residual.
   - Header viser residual ARC (ARC-en som gjelder), og «Overstyrt»-merket vises kun når det faktisk finnes en manuell reduksjon/erklæring.
   - Inkonsistens-advarselen vises kun i reelle tilfeller: AEC 12 uten operatørerklæring, eller AEC utenfor 1–12 — ikke ved iARC-avvik som skyldes en lovlig reduksjon.
3. Verifiser med typecheck at ingen andre steder er avhengige av den gamle (feilaktige) oppførselen.

## Teknisk detalj

`normalizeArc` går fra `/([abcd])/` til `/arc-?\s*([abcd])/i` med `/^\s*([abcd])\s*$/i` som sekundærmatch. `arcChanged`-beregningen (iARC vs. residual) blir da riktig, slik at «(ingen reduksjon)» / reduksjonstekst også stemmer.
