

## Fix: Filopplasting fra Google Disk feiler på Samsung

### Problem
Når en fil velges fra Google Disk (via Android file picker), er filen ofte en "content://" URI som ikke er ferdig nedlastet ennå. Når `FormData.append('file', file)` prøver å lese den, kan Android/Chrome feile med "Failed to fetch" fordi `File`-objektet ikke kan leses direkte.

Lokalt nedlastede filer fungerer fordi de er fullstendig tilgjengelige i filsystemet.

### Løsning
Les filen eksplisitt inn i minnet med `file.arrayBuffer()` **før** den legges til FormData. Dette tvinger browseren til å fullføre nedlastingen fra Google Disk. Deretter opprett en ny `File` fra den leste bufferen.

### Endring i `src/components/UploadDroneLogDialog.tsx`

**`handleUpload` (linje 605-617):**
```typescript
const handleUpload = async () => {
  if (!file) return;
  setIsProcessing(true);
  try {
    // Read file into memory first — fixes cloud-picker issues on Android
    const buffer = await file.arrayBuffer();
    const safeFile = new File([buffer], file.name, { type: file.type });

    const formData = new FormData();
    formData.append('file', safeFile);
    // ... rest unchanged
```

**`handleBulkUpload` (linje 664-671):**
Samme fix for hver fil i bulk-loopen:
```typescript
const buffer = await bulkFiles[i].arrayBuffer();
const safeFile = new File([buffer], bulkFiles[i].name, { type: bulkFiles[i].type });
const formData = new FormData();
formData.append('file', safeFile);
```

### Filer som endres
| Fil | Endring |
|-----|---------|
| `src/components/UploadDroneLogDialog.tsx` | Les fil til buffer for FormData i handleUpload og handleBulkUpload |

### Hvorfor dette fungerer
- Android file picker returnerer en lazy `File`-referanse for cloud-filer
- `file.arrayBuffer()` tvinger fullstendig lesing inn i minnet
- Den nye `File([buffer], ...)` er en vanlig in-memory blob som FormData kan sende uten problemer
- Ingen endring i edge functions nødvendig

