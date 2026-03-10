

## Problem: «Legg til som ny flytur» oppretter ikke ny flylogg

### Rotårsak
Når brukeren velger «Legg til som ny flytur» og klikker «Lagre flylogg», kjører `handleLinkToMission`. Denne funksjonen sjekker SHA-256-hashen mot eksisterende flylogger (linje 1273-1303). Siden DJI-filen allerede er importert én gang, finner den den eksisterende posten og **oppdaterer** den i stedet for å opprette en ny. Resultatet er at ingen ny flylogg blir opprettet — den eksisterende bare flyttes mellom oppdrag.

Ved andre forsøk: SHA-256-duplikatsjekken i prosesseringsfasen (linje 830) stopper hele flyten og pre-selecter den eksisterende loggen, så brukeren aldri kommer til «ny flytur»-valget.

### Løsning

**`src/components/UploadDroneLogDialog.tsx`** — Endre `handleLinkToMission` (linje 1286-1303):

Når brukeren eksplisitt har valgt «Legg til som ny flytur» (dvs. `matchedLog` er `null`), skal SHA-256-duplikatsjekken **hoppes over** og en ny flylogg alltid opprettes. SHA-256-feltet settes til `null` for den nye posten for å unngå unik-constraint-brudd.

Logikken blir:
1. Hvis brukeren valgte å oppdatere en eksisterende flytur (`matchedLog` er satt) → oppdater som i dag (håndteres av `handleUpdateExisting`)
2. Hvis brukeren valgte «Legg til som ny flytur» (`matchedLog` er null) → alltid insert ny rad, uten `dronelog_sha256`

### Endring

```typescript
// I handleLinkToMission, erstatt SHA-256-duplikatsjekken (linje 1273-1303) med:

// When user chose "add as new flight", always insert — skip SHA-256 dedup
const { dronelog_sha256, ...insertPayload } = logPayload as any;
const { data: inserted, error: logError } = await supabase
  .from('flight_logs')
  .insert(insertPayload as any)
  .select('id')
  .single();
if (logError) throw logError;
const logData = inserted;
```

Denne funksjonen kalles kun når `matchedLog` er null (dvs. brukeren vil opprette ny), så det er trygt å alltid inserte.

