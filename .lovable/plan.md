

## Fix: Filvelger henger på iOS ved valg av filer fra Google Drive

### Problem
På iOS Safari kan den native filvelgeren henge når man velger `.txt`-filer fra Google Drive eller andre skytjenester. Årsaken er at iOS sin `accept`-attributt med filendelser (`.txt,.zip,.bin`) kan skape problemer med skyfiler — iOS prøver å filtrere/laste ned filen før den leverer den til nettleseren, og dette kan henge.

### Løsning

**`src/components/UploadDroneLogDialog.tsx`** — To endringer:

1. **Utvid `accept`-attributten med MIME-typer i tillegg til filendelser**
   - Endre fra: `accept=".txt,.zip,.bin"`
   - Til: `accept=".txt,.zip,.bin,text/plain,application/zip,application/octet-stream"`
   - Dette hjelper iOS med å gjenkjenne filtyper fra skytjenester uten å forsøke nedlasting først

2. **Legg til en timeout-sikkerhetsmekanisme**
   - Vis en hjelpetekst/knapp etter ~5 sekunder dersom `handleFileSelect` ikke har blitt kalt etter at brukeren klikket på fil-input
   - Teksten forklarer at skyfiler kan ta tid, og tilbyr å prøve igjen med `accept="*/*"` (uten filtype-filter)

3. **Fallback-knapp: "Velg alle filtyper"**
   - Legg til en liten tekstlenke under filopplasteren: «Problemer med filvelgeren? Prøv uten filtype-filter»
   - Denne setter `accept="*/*"` på input-elementet og trigger filopplasteren på nytt
   - Valideringen av filtypen skjer allerede i `handleFileSelect`, så sikkerheten opprettholdes

### Fil som endres
- `src/components/UploadDroneLogDialog.tsx`

