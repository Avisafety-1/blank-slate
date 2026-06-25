## Problem

Filen som forårsaket problemet er en `.docx` (`Sjekkliste - Drone i åpen kategori.docx`). iOS Safari kan ikke vise Word-dokumenter inline — den prøver å laste dem ned, noe som forklarer den blanke nedlastingen i brukerens første skjermbilde. Den nåværende «Åpne dokument»-knappen er derfor utilstrekkelig på mobil.

## Plan

Endre kun `src/components/resources/ChecklistExecutionDialog.tsx` + installere én avhengighet.

### 1. Render .docx inline med mammoth.js
- `bun add mammoth` (~150kB, konverterer .docx til HTML i nettleseren).
- Utvid `getFileMode()` til å returnere `"docx"` for `.docx` og `.doc`.
- Når `fileMode === "docx"` og `fileUrl` er satt:
  - Hent fil-bytene: `const buf = await fetch(fileUrl).then(r => r.arrayBuffer())`.
  - Konverter: `const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf })`.
  - Render i en scrollbar boks: `<div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />`.
  - Loader-spinner mens konvertering pågår, error-tilstand hvis det feiler.
- Behold «Åpne i ny fane» som sekundær knapp under.

### 2. Andre Office-formater
xlsx/pptx faller fortsatt til den eksisterende «Åpne dokument»-grenen (kan ikke vises inline uten større biblioteker).

### Ingen endringer i:
- Backend, edge functions, DB, storage policies.
- Annen UI eller andre filtyper (image/pdf/json-checklists fungerer som før).
