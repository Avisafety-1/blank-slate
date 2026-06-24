## Problem

1. **PDF-sjekkliste vises som blank/hvit** i dialogen på mobil. `<iframe>`-rendering av PDF fungerer ikke pålitelig på Android Chrome eller iOS in-app browsere.
2. **To knapper for å markere som utført**: «Marker som utført» (inni file-content) og «Marker sjekklisten som utført» (footer). Brukeren vil bare ha den nederste.

## Plan

Endre kun `src/components/resources/ChecklistExecutionDialog.tsx` + installere én avhengighet.

### 1. Render PDF inline med react-pdf
- `bun add react-pdf` (bruker `pdfjs-dist` under panseret).
- Sett opp pdf.js worker fra CDN: `pdfjs.GlobalWorkerOptions.workerSrc = ...`.
- I `fileMode === "pdf"`-grenen, erstatt `<iframe>` med:
  ```tsx
  <Document file={fileUrl} loading={<p>Laster PDF...</p>}>
    {pages.map(n => <Page key={n} pageNumber={n} width={containerWidth} />)}
  </Document>
  ```
- Mål container-bredden via ref, slik at sidene fyller dialogen.
- Behold «Åpne i ny fane»-knappen som sekundær handling.

### 2. Fjern duplikat-knappen
- Slett den indre `Marker som utført`-knappen (linje 282-298) og `manuallyCompleted`-state.
- Endre `allItemsChecked`-betingelsen: `isFileMode ? true : items.length > 0 && checkedItems.size === items.length`.
- Footer-knappen «Marker sjekklisten som utført» er da aktiv umiddelbart for file/PDF/image-sjekklister og fullfører direkte.

Ingen endringer i backend, edge functions eller DB.
