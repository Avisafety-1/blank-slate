

## Plan: Legg til hendelsesbilder i PDF-eksport

### Problem
Når en hendelse har et opplastet bilde (`bilde_url`), inkluderes det ikke i den eksporterte PDF-rapporten.

### Løsning
Utvid `exportIncidentPDF` i `src/lib/incidentPdfExport.ts`:

1. **Utvid `Incident`-typen** med `bilde_url: string | null`
2. **Hent bildet som base64** — last ned bildet via `fetch()` fra den offentlige URL-en, konverter til base64 data-URL
3. **Legg til en VEDLEGG-seksjon** etter kommentarer:
   - Ny seksjon med header «VEDLEGG»
   - Bruk `checkPageBreak` for å sikre plass (evt. ny side)
   - Sett inn bildet med `doc.addImage()` — skalert til å passe sidebredden (maks ~170mm bred, behold proporsjoner)

### Filer som endres
1. `src/lib/incidentPdfExport.ts` — legg til bildenedlasting og `addImage` i PDF-genereringen

### Teknisk detalj
```typescript
// Etter kommentarer-seksjonen:
if (incident.bilde_url) {
  // Fetch image, convert to base64
  const response = await fetch(incident.bilde_url);
  const blob = await response.blob();
  const imgData = await blobToBase64(blob);
  
  yPos = checkPageBreak(doc, yPos, 120);
  yPos = addSectionHeader(doc, "VEDLEGG", yPos);
  
  // Add image scaled to fit page width
  const maxWidth = pageWidth - 28;
  doc.addImage(imgData, 'JPEG', 14, yPos, maxWidth, 0); // height=0 => auto
}
```

Ingen database-endringer nødvendig — `bilde_url` finnes allerede på `incidents`-tabellen.

