

## Bulk-opplasting via flervalg i eksisterende filvelger

### Tilnærming
Utvide den eksisterende manuelle opplastingen til å støtte flere filer (maks 10) ved å legge til `multiple` på file-inputen. Når flere filer er valgt, prosesseres de sekvensielt med automatisk drone/oppdrag-matching og lagring — en progressindikator og en oppsummeringstabell vises til slutt.

### Endringer i `src/components/UploadDroneLogDialog.tsx`

**1. State-endringer**
- `file: File | null` → `files: File[]`
- Ny: `bulkResults: Array<{ fileName, status, error?, droneModel?, missionTitle? }>`
- Ny: `bulkProgress: number` (nåværende fil-indeks)
- Ny: `isBulkMode: boolean` (true når files.length > 1)
- Nytt steg: `'bulk-result'` i Step-typen

**2. `handleFileSelect`** — Aksepter alle valgte filer (maks 10), valider filtype
```typescript
const selected = Array.from(e.target.files || []).slice(0, 10);
// validate extensions, setFiles(selected)
```

**3. File input** — Legg til `multiple`, maks 10
```html
<input multiple type="file" accept=".txt,.zip" ... />
```

**4. Upload-steget UI** — Vis filliste når flere er valgt
- Vis antall valgte filer og filnavn
- Knapp: «Behandle X filer»

**5. `handleBulkUpload`** — Ny funksjon for sekvensielt prosessering
- For hver fil: kall edge function, auto-match drone (serienummer), auto-match oppdrag (tidspunkt innen 1 time), SHA-256 duplikatsjekk, lagre automatisk med innlogget bruker som pilot
- Oppdater `bulkProgress` og `bulkResults` for hver fil
- Gå til `'bulk-result'` når ferdig

**6. Nytt steg `'bulk-result'`** — Oppsummeringstabell
```text
| Fil              | Drone       | Oppdrag        | Status    |
|------------------|-------------|----------------|-----------|
| log1.txt         | DJI Mini 4  | Inspeksjon #3  | ✅ Lagret  |
| log2.txt         | DJI Mini 4  | —              | ✅ Lagret  |
| log3.txt         | —           | —              | ⚠️ Duplikat|
```
- «Lukk»-knapp

**7. Én fil** — Eksisterende flyt beholdes uendret (velger man kun 1 fil, brukes dagens steg-for-steg-flyt)

Ingen nye avhengigheter. Ingen databaseendringer.

