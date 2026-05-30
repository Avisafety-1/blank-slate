## Legend for Eiendomsgrenser-laget

Når brukeren slår på kartlaget "Eiendomsgrenser" på `/kart`, vis en liten legend/info-boks på kartet som forklarer at gnr/bnr kan brukes for å slå opp eier på Kartverkets eiendomsregister.

### Endringer

1. **Ny komponent `src/components/EiendomsgrenserLegend.tsx`**
   - Følger samme mønster som `ArealbrukLegend.tsx` og `TettstederLegend.tsx` (absolutt posisjonert, `bg-background/95 backdrop-blur-sm`, `z-[1000]`).
   - Innhold:
     - Tittel: "Eiendomsgrenser (Matrikkelen)"
     - Tekst: "Bruk gnr/bnr (klikk i kartet for å se nummer) til å slå opp eier på Kartverkets eiendomsregister."
     - Lenke-knapp til `https://eiendomsregisteret.kartverket.no/` (åpner i ny fane, `rel="noopener noreferrer"`).
   - Responsiv:
     - Mobil (`<sm`): full bredde nederst (`left-2 right-2 bottom-4`), kompakt tekst (`text-[10px]`), wrap.
     - Desktop (`sm:`): plassert nede til venstre (`sm:left-4 sm:right-auto sm:w-auto sm:max-w-xs`), litt større tekst (`sm:text-xs`).
   - Bruker semantiske tokens (`text-foreground`, `text-muted-foreground`, `text-primary` for lenken).

2. **`src/components/OpenAIPMap.tsx`**
   - Importer `EiendomsgrenserLegend`.
   - Spor om laget er aktivt via eksisterende `activeLayers` state (samme mønster som `ArealbrukLegend`/`TettstederLegend` allerede bruker for sine lag).
   - Render `<EiendomsgrenserLegend />` betinget når `eiendomsgrenser`-laget er på.
   - Hvis flere legends kan være synlige samtidig, juster `bottom-`/`left-` offsets så de ikke overlapper (sjekkes når jeg ser eksisterende plasseringer).

### Ingen andre endringer

- WMS-laget, klikk-popup (GetFeatureInfo) og lag-registrering forblir uendret.
- Ingen DB-, backend- eller andre kartlag-endringer.
