## Problem

PDF-en feiler med «Failed to fetch dynamically imported module … pdf.worker.min.mjs». cdnjs har ikke pdf.js versjon 5.4.296 (versjonen `react-pdf` installerte). Worker-URL-en peker på en fil som ikke finnes.

## Plan

Endre `src/components/resources/ChecklistExecutionDialog.tsx`:

Bytt fra cdnjs til en pålitelig kilde for worker-filen. Vite støtter import av filer som URL med `?url`-suffix, så vi laster worker-en direkte fra `pdfjs-dist`-pakken som ble installert lokalt (samme versjon som `react-pdf` bruker — ingen versjonsmismatch mulig):

```ts
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
```

Worker-filen blir da bundlet av Vite, servert fra samme origin, og alltid i riktig versjon.

Ingen andre endringer.
