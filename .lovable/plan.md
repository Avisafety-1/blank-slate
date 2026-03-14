

## Fix: Dokumenttittel sprenger bredden på mobil

**Problem**: Lange dokumenttitler i "Tilknyttede dokumenter"-seksjonen gjør at hele dialogen blir bredere enn skjermen på mobil. `truncate` (som bruker `white-space: nowrap`) fungerer ikke korrekt i denne flex-konteksten.

**Løsning**: Bytt fra `truncate` til `break-words` på dokumenttittelen, slik at lange titler brytes over flere linjer i stedet for å tvinge bredden ut. Behold `truncate` kun på metadata-linjen (kategori/filnavn).

**Endring i `DroneDetailDialog.tsx`** (linje 1175-1186):

- Legg til `overflow-hidden` på ytre rad-container
- Endre tittelen fra `truncate` til `break-words` (`overflow-wrap: break-word`)
- Behold `truncate` på metadata-linjen

Én fil endres: `src/components/resources/DroneDetailDialog.tsx`

