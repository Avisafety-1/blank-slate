
## Problem

- "Inspection package" produserer en **ZIP** (PDF + vedlegg), ikke en PDF.
- Filen åpnes med `window.open(signedUrl, "_blank")` etter en async mutation. På iPad Safari blir dette blokkert som popup, og selv når vinduet åpnes serverer signed URL-en filen `inline` uten filnavn, så en `.zip` bare henger på et blankt fane (som i skjermbildet ditt).
- Samme problem gjelder "Download"-knappen i historikklisten.

## Fiks

Kun frontend-endringer i to filer.

### 1. `src/components/admin/audit/services/InspectionPackageBuilder.ts`

- Bygg et menneskelesbart filnavn: `inspection-package-<company-slug>-<yyyy-mm-dd>.zip`.
- Legg til `?download=<filnavn>` på signed URL (Supabase Storage tolker dette som `Content-Disposition: attachment; filename=...`).
- Returner `fileName` i `BuildResult`.
- Oppdater `getPackageSignedUrl(storagePath, fileName?)` slik at historikk-nedlasting også får `?download=`.

### 2. `src/components/admin/audit/tabs/InspectionPackageTab.tsx`

Bytt ut `window.open(url, "_blank")` med en robust nedlastingshjelper som:

```ts
function triggerDownload(url: string, fileName: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;      // hint til nettleseren
  a.rel = "noopener";
  a.target = "_self";         // unngå popup-blokkering på iOS
  document.body.appendChild(a);
  a.click();
  a.remove();
}
```

- Bruk denne både etter vellykket generering (`onSuccess`) og i `openHistoric`.
- For historikk må vi kjenne filnavnet: utled fra `storage_path` (siste segment) eller lagre `file_name` i `inspection_packages`-raden. Enkleste variant nå: derivér `${basename}` fra `storage_path` og bruk som `download=`-verdi – den blir uansett `.zip`, og signed URL-parameteret sørger for attachment-headeren.

### Hvorfor dette virker

- `?download=filename.zip` på Supabase signed URL setter `Content-Disposition: attachment` slik at iOS/iPadOS faktisk laster ned filen i stedet for å prøve å vise den inline.
- Å bruke et `<a>`-element med `.click()` i samme mikrotask som brukerens klikk (eller like etter await) er tillatt av iOS så lenge navigasjonen ikke åpner en ny fane – derfor `target="_self"`.

### QA

1. Generer et nytt package på iPad → skal starte nedlasting av `.zip`.
2. Klikk "Download" i historikklisten → samme oppførsel.
3. Verifiser på desktop Chrome/Safari at nedlastingen fortsatt fungerer (fil åpnes/lagres, ingen popup blokkeres).

### Ingen backend-endringer

- Ingen migrasjoner, ingen edge-funksjoner.
- ZIP-struktur og innhold er uendret.
