## Plan

### Mål
Endre plasseringen av «Tilbake til oppdrag»-knappen i `/kart` slik at den:
1. Fjernes fra ruteplanleggerens horisontale verktøylinje (både mobil og desktop).
2. I stedet vises direkte på kartflaten, rett over «Traffic data provided by SafeSky»-badgen.
3. Er stor, tydelig og blå.
4. Kun vises når en eksisterende oppdragsrute redigeres (`editingMissionId` er satt).

### Tekniske detaljer

**Fil som endres:** `src/pages/Kart.tsx`

**Steg:**

1. **Fjern knappen fra verktøylinjene**
   - Mobil: fjern blokk `editingMissionId && (…)` rundt linje 752–761 inne i den første `sm:hidden` ruteplanlegger-raden.
   - Desktop: fjern tilsvarende blokk rundt linje 931–942 inne i `hidden sm:flex` ruteplanlegger-raden.

2. **Plasser knappen på kartflaten**
   - I området rundt linje 1121, rett over SafeSky-attribusjons-diven (`absolute top-2 left-1/2 -translate-x-1/2 z-[500]`), legg inn en ny wrapper som plasserer begge elementer i en vertikal kolonne midt på kartet.
   - Wrap SafeSky-badgen og den nye knappen i en `<div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] flex flex-col items-center gap-2 pointer-events-none">`.
   - Knappen får `pointer-events-auto` slik at den er klikkbar.
   - Knappen bruker `<Button variant="default" size="lg" className="…">` for å bli stor, tydelig og blå (sky-blue primærfarge fra temaet).
   - Knappen inneholder `<ArrowLeft className="h-5 w-5" />` og teksten «Tilbake til oppdrag».
   - Knappen rendres betinget: `{editingMissionId && <Button … />}`.

3. **Behandle klikk uendret**
   - `onClick={() => navigate('/oppdrag', { state: { missionId: editingMissionId, scrollToMission: true } })}`
   - Dette beholder eksisterende tilbake-navigasjon og scroll-til-kort-funksjonalitet.

### Hva som IKKE endres
- «Lagre»-knappens oppførsel forblir uendret: ved redigering av eksisterende oppdrag lagres ruten og brukeren forblir på `/kart`; for nye ruter åpnes oppdragsdialogen som før.
- Navigasjonslogikken i `Oppdrag.tsx` (scroll til kort + highlight) berøres ikke.
- SafeSky-badgen beholdes, bare flyttes inn i samme vertikale wrapper for riktig plassering.

### Gjennomføring
Når planen godkjennes, implementeres endringene i én fil (`src/pages/Kart.tsx`), og en rask visuell sjekk av previewet gjennomføres for å bekrefte plassering og styling.