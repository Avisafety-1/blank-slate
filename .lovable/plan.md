## Problem

Konsollfeil: `The API version "5.4.296" does not match the Worker version "4.4.168"`.

- `react-pdf` har sin egen `pdfjs-dist@5.4.296` som dependency (brukes når vi importerer `Document`/`Page`/`pdfjs` fra `react-pdf`).
- Vi laster worker via `import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url"` — denne resolver til hoisted `pdfjs-dist@4.4.168` (brukt av `TrainingCourseEditor`/`AICourseGeneratorDialog`).
- Versjonene matcher ikke → PDF-rendering feiler.

Andre komponenter (`TrainingCourseEditor`, `AICourseGeneratorDialog`) bruker allerede CDN-mønsteret med `pdfjs.version` for å garantere match.

## Plan

Kun én fil: `src/components/resources/ChecklistExecutionDialog.tsx`.

1. Fjern `?url`-importen av `pdf.worker.min.mjs` (peker på feil versjon).
2. Sett worker-URL fra CDN basert på `pdfjs.version` — som her er re-eksportert fra `react-pdf` og dermed alltid lik 5.4.296 (eller hva enn react-pdf oppgraderes til senere):

```ts
pdfjs.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
```

Konsistent med eksisterende mønster i `TrainingCourseEditor.tsx`.

Ingen endringer i package.json, andre filer eller backend.
