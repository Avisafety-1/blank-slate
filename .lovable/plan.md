
# Eksporter risikovurdering til PDF

## Oversikt
Legge til "Eksporter til PDF"-knapp i risikovurderingsdialogen, bade i resultat-fanen (ved siden av "Lagre kommentarer") og i historikk-fanen (per vurdering). PDF-en genereres med samme innhold som vises pa skjermen, og lagres i dokumenter under en ny kategori "risikovurderinger".

## Endringer

### 1. Ny dokumentkategori "risikovurderinger"
Legge til "risikovurderinger" i alle steder der dokumentkategorier er definert:

- **src/pages/Documents.tsx** - Utvide `DocumentCategory`-typen
- **src/components/documents/DocumentsFilterBar.tsx** - Legge til filter-badge
- **src/components/documents/DocumentCardModal.tsx** - Legge til i zod-enum og CATEGORIES-listen
- **src/lib/userManualPdf.ts** - Oppdatere kategorilisten i brukermanualen

### 2. Ny fil: `src/lib/riskAssessmentPdfExport.ts`
Opprette en ny eksportfunksjon etter same monster som `incidentPdfExport.ts`. Funksjonen tar inn vurderingsdata og genererer en PDF med:

- **Header**: "RISIKOVURDERING" med oppdragstittel og eksporttidspunkt
- **Oppdragsoversikt**: Hvis tilgjengelig fra AI-analysen
- **Vurderingsmetode**: Hvis tilgjengelig
- **Samlet score**: Score og anbefaling (GO/BETINGET/NO-GO)
- **Kategoriscorer**: Tabell med hver kategori (Vaer, Luftrom, Piloterfaring, etc.) med score, GO-beslutning, positive faktorer, bekymringer, og pilotkommentar
- **Anbefalte tiltak**: Gruppert etter prioritet (hoy, medium, lav)
- **Forutsetninger**: Hvis tilgjengelig
- **AI-forbehold**: Disclaimer-tekst

Funksjonen laster opp til Supabase Storage under `documents`-bucketen og oppretter en dokumentoppforing med kategori "risikovurderinger".

### 3. Oppdatere `RiskAssessmentDialog.tsx`
- Importere eksportfunksjonen og `FileDown`-ikonet
- Legge til `exportingPdf`-state
- Legge til `exportToPdf`-funksjon som kaller eksportfunksjonen med current assessment data
- **Resultat-fanen**: Legge til "Eksporter til PDF"-knapp ved siden av "Lagre kommentarer" (begge i en flex-rad)
- **Historikk-fanen**: Legge til en liten "Eksporter til PDF"-knapp pa hver historisk vurdering

## Tekniske detaljer

### Ny eksportfunksjon (riskAssessmentPdfExport.ts)

```typescript
interface RiskExportOptions {
  assessment: any; // AI-analysedata
  missionTitle: string;
  categoryComments: Record<string, string>;
  companyId: string;
  userId: string;
  createdAt?: string;
}

export const exportRiskAssessmentPDF = async (options: RiskExportOptions): Promise<boolean> => {
  // 1. Opprett PDF med createPdfDocument()
  // 2. Header med "RISIKOVURDERING" og oppdragstittel
  // 3. Oppdragsoversikt og vurderingsmetode
  // 4. Samlet score og anbefaling
  // 5. Kategoriscorer med autoTable
  // 6. Pilotkommentarer per kategori
  // 7. Anbefalte tiltak
  // 8. Forutsetninger
  // 9. Last opp til storage og opprett dokumentoppforing
};
```

### Kategori-tabell i PDF
Bruker `jspdf-autotable` for a vise kategoriscorer:

| Kategori | Score | Beslutning | Kommentar |
|----------|-------|------------|-----------|
| Vaer | 8.5/10 | GO | Sjekket lokalt... |
| Luftrom | 7.0/10 | BETINGET | Kontaktet taarnet... |

Deretter listes faktorer (positive) og bekymringer (negative) under tabellen for hver kategori.

### Knappeplassering

**Resultat-fanen** - Erstatter enkeltknapp med en flex-rad:
```tsx
<div className="flex gap-2">
  <Button onClick={saveComments} ...>Lagre kommentarer</Button>
  <Button onClick={exportToPdf} ...>Eksporter til PDF</Button>
</div>
```

**Historikk-fanen** - Legger til en liten knapp pa hver rad med `e.stopPropagation()` for a unnga a apne vurderingen:
```tsx
<Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); exportHistoryItem(assessment); }}>
  <FileDown className="w-4 h-4" />
</Button>
```

### Filer som endres
1. `src/lib/riskAssessmentPdfExport.ts` (ny fil)
2. `src/components/dashboard/RiskAssessmentDialog.tsx` (knapper + eksportlogikk)
3. `src/pages/Documents.tsx` (ny kategori i type)
4. `src/components/documents/DocumentsFilterBar.tsx` (ny filter-badge)
5. `src/components/documents/DocumentCardModal.tsx` (ny kategori i enum + liste)
6. `src/lib/userManualPdf.ts` (oppdatere kategoriliste)
