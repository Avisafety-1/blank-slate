## Mål
1. Forbedre DOCX-visningen i sjekkliste-dialogen så den ser penere ut (overskrifter, lister, tabeller, fet/kursiv, riktig avstand).
2. "Åpne"-knappen skal tvinge nedlasting når filen ikke kan vises i nettleseren (.docx, .doc, .xlsx, .pptx, osv.). PDF og bilder skal fortsatt åpnes i ny fane som før.

## Endringer (kun `src/components/resources/ChecklistExecutionDialog.tsx`)

### 1. Bedre mammoth-konvertering
Bytt `convertToHtml({ arrayBuffer })` til en variant med eksplisitt styleMap som mapper Word-stiler til semantiske HTML-tagger:

```ts
const result = await mammoth.convertToHtml(
  { arrayBuffer },
  {
    styleMap: [
      "p[style-name='Title'] => h1.docx-title:fresh",
      "p[style-name='Subtitle'] => h2.docx-subtitle:fresh",
      "p[style-name='Heading 1'] => h2:fresh",
      "p[style-name='Heading 2'] => h3:fresh",
      "p[style-name='Heading 3'] => h4:fresh",
      "p[style-name='Heading 4'] => h5:fresh",
      "p[style-name='Quote'] => blockquote:fresh",
      "p[style-name='List Paragraph'] => p.docx-list-p:fresh",
      "r[style-name='Strong'] => strong",
      "r[style-name='Emphasis'] => em",
      "b => strong",
      "i => em",
      "u => u",
    ],
    includeDefaultStyleMap: true,
    ignoreEmptyParagraphs: false,
  },
);
```

### 2. Innpakning med eget CSS-skop
Render konvertert HTML inne i en `<div className="docx-content prose prose-sm dark:prose-invert max-w-none">` og legg en liten `<style>`-blokk (eller Tailwind-klasser) som gir:
- Tabeller: full bredde, `border-collapse`, tynne grå border, padding i celler, striped header
- Bilder: `max-w-full h-auto rounded`
- Lister: korrekt indent og avstand
- Headings: tydeligere størrelse + margin
- Avsnitt: leselig `line-height` og avstand
- Bryt lange ord (`break-words`) og scroll horisontalt på smale skjermer for brede tabeller

CSS legges som en lokal `<style>`-tag scoped via `.docx-content` (ingen global påvirkning).

### 3. "Åpne"-knappen tvinger nedlasting for ikke-viseable filer

Lag en hjelper:
```ts
const isBrowserViewable = (mode: FileMode) => mode === "image" || mode === "pdf";

const handleOpenFile = async () => {
  if (!fileUrl) return;
  if (isBrowserViewable(fileMode)) {
    window.open(fileUrl, "_blank");
    return;
  }
  // Tving nedlasting via blob + <a download> for docx/doc/document
  try {
    const res = await fetch(fileUrl);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "sjekkliste";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    // Fallback: vanlig åpne
    window.open(fileUrl, "_blank");
  }
};
```

Bruk `handleOpenFile` på begge knappene i `docx`-grenen og den generelle `document`-grenen. Bytt ikon til `Download` og tekst til "Last ned" når `!isBrowserViewable(fileMode)`. PDF/bilde-grenen beholder dagens "Åpne i ny fane".

### 4. Berørte UI-strenger
- DOCX-fane: knappen blir "Last ned dokument" (ikon: Download).
- Ukjent-dokument-fane: knappen blir "Last ned sjekkliste" (ikon: Download).
- PDF/image: uendret.

## Hva vi IKKE rører
- Sjekkliste-logikk, sjekkboks-state, PDF-pinch-zoom, signering, lagring.
- Andre dialoger / komponenter.
- Storage policies eller backend.

## Verifisering
1. Åpne en .docx-sjekkliste — bekreft pen visning (overskrifter, lister, tabeller med border, bilder skalert).
2. Klikk "Last ned dokument" — bekreft at filen lastes ned med riktig filnavn (ikke åpnes i ny fane).
3. Åpne en PDF — knappen åpner fortsatt i ny fane.
4. Åpne et bilde — uendret.
5. Sjekk mørkt tema — tekst og borders er leselige.
