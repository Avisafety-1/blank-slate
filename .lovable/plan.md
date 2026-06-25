## Mål
På mobil skal tegnefeltet i `SignatureDrawerDialog` vises rotert 90° (landskap) selv om telefonen holdes vertikalt. Brukeren tegner sidelengs uten å snu telefonen, og signaturen lagres som et normalt liggende bilde. Skal tilpasse seg ulike skjermstørrelser (iPhone 13 Pro, iPhone SE, Pro Max osv.).

## Endringer (kun `src/components/SignatureDrawerDialog.tsx`)

### 1. Oppdage mobil
Bruk eksisterende `useIsMobile()` fra `@/hooks/use-mobile` for å vite om vi skal rotere. Desktop/tablet (≥ 768px) beholder dagens layout.

### 2. Rotert canvas-container på mobil
Inne i `flex-1`-området:
- En ytre wrapper måler tilgjengelig høyde og bredde via `ResizeObserver` (eller `getBoundingClientRect` på containeren etter mount/resize).
- En indre wrapper som inneholder canvas får CSS `transform: rotate(-90deg)` og bytter bredde/høyde:
  - `width  = containerHøyde`
  - `height = containerBredde`
  - `transformOrigin: "center center"`
- Canvas-elementet får `width = containerHøyde` og `height = containerBredde` (logiske piksler), slik at det fyller hele det roterte området. Bruk `devicePixelRatio` for skarp tegning (sett `canvas.width = cssW * dpr`, `canvas.height = cssH * dpr`, `ctx.scale(dpr, dpr)`).
- Resultatet: brukeren ser et bredt landskaps-lerret som dekker hele dialogens innhold-område.

### 3. Justere koordinatberegning for berøring
`getCoordinates` må kompensere for rotasjonen når `isMobile === true`:
- Hent `rect = canvas.getBoundingClientRect()` (rect-en er allerede den synlig-roterte boksen).
- Beregn lokal posisjon ved å bruke rotasjonsmatrise:
  - `localX = (clientY - rect.top)`
  - `localY = (rect.right - clientX)`
  (dvs. -90° rotasjon → tegnekoordinater i canvasens eget koordinatsystem)
- Del på `dpr` ikke nødvendig hvis vi bruker `ctx.scale(dpr, dpr)`.

### 4. Lagring – bilde i landskap
- Når `isMobile`, lagres canvas direkte (det er allerede et bredt landskaps-bilde i sin egen referanseramme). Ingen ekstra rotering ved blob-export – `toBlob` returnerer korrekt orientert PNG.
- Eksisterende upload-flyt til `signatures`-bucket og `profiles.signature_url` er uendret.

### 5. Re-init ved resize / orientation change
- Legg til `window.addEventListener('resize', initCanvas)` og fjern i cleanup.
- Bevar `useEffect` på `open` for første init.
- Når størrelsen endres mister vi tegningen (akseptabelt – samme som i dag ved orientering).

### 6. UI-tips på mobil
Liten tekst over lerretet på mobil: "Tegn signaturen din sidelengs". På desktop vises ingen ekstra tekst.

### 7. Header/footer-knapper
Uendret. "Tøm", "Angre" og "Lagre" beholdes nederst i normal portrett-orientering.

## Teknisk skisse

```
+------------------ dialog (portrait) ------------------+
| Header                                                |
+-------------------------------------------------------+
|   outer (flex-1, padding, måler w×h)                  |
|   ┌─────────────────────────────────────────────┐     |
|   │  rotated wrapper                            │     |
|   │  width=h, height=w, transform: rotate(-90)  │     |
|   │  ┌───────────────────────────────────────┐  │     |
|   │  │           canvas (bred, lav)          │  │     |
|   │  └───────────────────────────────────────┘  │     |
|   └─────────────────────────────────────────────┘     |
+-------------------------------------------------------+
| Footer (Tøm / Angre / Lagre)                          |
+-------------------------------------------------------+
```

## Hva vi IKKE rører
- `SignaturePad.tsx` (knappene utenfor)
- Storage policies / upload-logikk
- Profil-update-kall
- Desktop-visning (bredt felt som før)

## Verifisering
1. Åpne profil på iPhone 13 Pro (390×844), iPhone SE (375×667) og Pro Max (430×932) i preview-mobil-viewport. Bekreft at lerretet fyller området og er rotert.
2. Tegn med finger – streken følger fingeren naturlig sidelengs.
3. Trykk Angre/Tøm – fungerer.
4. Trykk Lagre – sjekk at signaturen lastes opp og vises riktig vei i profilen.
5. Sjekk desktop (≥ 768px) – uendret oppførsel.
