

## Fix: Duplikat vedleggsopplasting + legg til overwrite-støtte

### Problem
1. Samme fil sendes to ganger til E2 API — andre gang feiler med "files already exist, set overwrite to true"
2. Gatewayen sender aldri `overwrite=true` query-parameter

### Endringer

#### 1. `supabase/functions/_shared/eccairs-gateway-server.js`
- Legg til `overwrite=true` som standard query-parameter i attachment-opplastingen:
```js
queryParams.append("overwrite", "true");
```
Dette sikrer at re-opplasting av samme filnavn alltid fungerer.

#### 2. `src/components/eccairs/EccairsAttachmentUpload.tsx`
- Legg til guard mot dobbelt-klikk: disable upload-knappen umiddelbart ved klikk (allerede delvis gjort via `isUploading`, men sjekk at `selectedDocs` state-oppdateringen ikke fører til at samme fil prosesseres to ganger)
- Sjekk `item.status !== 'pending'` er korrekt, men `selectedDocs` leses fra closure — bruk funksjonell oppdatering for å sikre at status-sjekken reflekterer nyeste state

### Filer som endres

| Fil | Endring |
|-----|---------|
| `eccairs-gateway-server.js` | Legg til `overwrite=true` i queryParams |
| `EccairsAttachmentUpload.tsx` | Forhindre dobbelt-sending av samme dokument |

