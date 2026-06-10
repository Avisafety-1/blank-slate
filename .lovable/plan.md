## Årsak

Dette er ikke et vanlig z-index-problem. I 3D-kartet bruker grønn/gul sone `fill-extrusion`, og disse skrives inn i kartets dybdebuffer. Rutelinja ligger på bakken og havner derfor fysisk inni/under de ekstruderte volumene. Da blir den skjult av 3D-geometrien selv om sonene er transparente.

## Løsning

Jeg legger tilbake en egen rute-overlay som tegnes over 3D-sonene, men gjør den terrengkorrekt i stedet for flat:

1. Beholde den eksisterende MapLibre-rutelinja som ligger på bakken og følger terrenget.
2. Lage en ekstra visuell rute-overlay i skjermlaget, kun for synlighet over sonene.
3. Overlayen skal sample ruten tett langs segmentene, slik at den følger den samme terrengprojeksjonen som kartet bruker (`map.project` med terrain aktivt).
4. Overlayen tegnes med mørk halo + cyan linje over 3D-sonene, men uten å påvirke rutedata, buffersoner, klikk, drag eller analyser.
5. Oppdatere overlayen på `move`, `render`, rutepunkt-endringer og når 3D-ruten bygges om, slik at den holder seg koblet til bakken/markørene ved panorering, zoom og pitch.

## Filer som endres

- `src/components/Map3D.tsx`
  - Gjeninnføre SVG-ruteoverlayen, men kun som synlighetslag.
  - Endre overlay-beregningen slik at den samples tett og bruker kartets terrengprojeksjon.
  - Holde den under UI-knapper, men over 3D-sonene.

## Hva som ikke endres

- Ingen endring i SORA-bufferberegning.
- Ingen endring i rutepunkt/drag/slett-logikk.
- Ingen senking av opacity som hovedløsning.
- Ingen overgang til Three.js i denne endringen.
