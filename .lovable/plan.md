## Mål
Gjøre PDF-en i `ChecklistExecutionDialog` zoombar med to-finger pinch (og pan når innzoomet), mens den fortsatt starter i full bredde av dialogen.

## Endring (kun frontend)

**`src/components/resources/ChecklistExecutionDialog.tsx`** — pakk inn PDF-rendringen i en zoom-/pan-container:

1. Ny state `pdfScale` (default `1`) og `pdfOffset` (`{x:0, y:0}`).
2. Beholder `pdfContainerRef`-måling som i dag, slik at `<Page width={pdfContainerWidth} />` fortsatt gir full bredde fra start.
3. Legger til en indre wrapper rundt `<Document>` med:
   - `style={{ transform: \`translate(${x}px, ${y}px) scale(${pdfScale})\`, transformOrigin: '0 0' }}`
   - `touch-action: none` på den ytre rammen for å hindre at Safari/iOS tar over gesten.
4. Pinch/pan håndteres med native pointer events (ingen nytt bibliotek):
   - Holder en `Map<pointerId, {x,y}>` på `onPointerDown/Move/Up/Cancel`.
   - 1 finger + scale>1 → pan (oppdater offset).
   - 2 fingre → regn ut avstand mellom punktene; ratio mot start-avstand multipliseres med start-scale. Clamp `0.5–5`.
   - Ved scale tilbake til ~1 → reset offset til `{0,0}`.
5. Legger til små «−  100%  +  ⟲»-knapper øverst til høyre i PDF-rammen som fallback (desktop/mus). Reset-knapp nullstiller scale + offset.
6. Den ytre rammen får `overflow-hidden` og fast/min høyde slik at innzoomet innhold kan pannes uten å sprenge dialogen. Selve dialog-scrollen (`overflow-y-auto` rundt) beholdes for når scale=1.
7. Når brukeren bytter fane / laster nytt PDF (`fileUrl` endrer seg) → reset scale=1 og offset=0.

Ingen endringer i worker-oppsettet, ingen nye pakker, ingen backend-endringer.

## Teknisk detalj
- Pointer Events fungerer på iOS Safari 13+, så ingen behov for `react-use-gesture`/Hammer.
- `transformOrigin: '0 0'` + manuell offset gir presis pinch rundt midtpunktet mellom de to fingrene (vi justerer offset slik at midtpunktet i sidens lokale koordinater holder seg under fingrene).
- `touch-action: none` settes kun på PDF-rammen, ikke på resten av dialogen, så vanlig scroll i sjekklistedialogen er uberørt.

## Verifisering
- `tsgo --noEmit` etter endring.
- Manuell test fra StartFlightDialog → sjekkliste med PDF: pinch zoom inn/ut, pan, reset-knapp, byte fane resetter, «Åpne i ny fane» fungerer fortsatt.
