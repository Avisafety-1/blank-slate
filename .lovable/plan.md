

## Fiks touch-offset i signatur-tegning

### Problem
Canvas-elementets interne piksel-dimensjoner settes fra containerens storrelse (som inkluderer `p-4` padding), men selve canvas-elementet rendres med CSS `w-full h-full` innenfor paddingen. Dette skaper en skala-mismatch mellom hvor fingeren er og hvor streken tegnes -- streken havner ved siden av fingeren i stedet for rett under.

### Losning
Endre `initCanvas` til a bruke canvas-elementets egen `getBoundingClientRect()` i stedet for containerens. Da matcher piksel-dimensjonene noyaktig med den synlige storrelsen, og koordinatene blir korrekte.

### Teknisk endring

**Fil: `src/components/SignatureDrawerDialog.tsx`**

I `initCanvas`-funksjonen (linje 33-53):
- Bruk `canvas.getBoundingClientRect()` i stedet for `container.getBoundingClientRect()` for a sette `canvas.width` og `canvas.height`.
- `containerRef` kan beholdes for a sikre at komponenten er rendret, men dimensjonene tas fra selve canvas-elementet.

For-kode:
```
const rect = container.getBoundingClientRect();
canvas.width = rect.width;
canvas.height = rect.height;
```

Etter-kode:
```
const rect = canvas.getBoundingClientRect();
canvas.width = rect.width;
canvas.height = rect.height;
```

Dette er en endring pa en linje som fikser hele offset-problemet.

