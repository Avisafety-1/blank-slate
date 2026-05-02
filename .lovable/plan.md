Jeg sjekket loggene. Feilen kommer fortsatt fra `process-dronelog`, ikke fra de to funksjonene vi endret sist.

Loggene viser at UI-et ved valg av DJI Cloud-logg kaller action `dji-process-log` i `process-dronelog`, og den gamle koden kjører fortsatt:

```text
[process-dronelog] downloading file from .../logs/{accountId}/{logId}/download
[process-dronelog] downloaded ... bytes (.zip), uploading via /logs/upload
[process-dronelog] upload failed: 500 { "message": "Server Error" }
[process-dronelog] TXT upload failed ...
[process-dronelog] re-zipped ... retrying /logs/upload
[process-dronelog] upload failed: 500
```

Det betyr at endringen i `dji-process-single` og `dji-auto-sync` ikke treffer denne manuelle “velg logg fra DJI Cloud”-flyten. Den bruker fortsatt `process-dronelog` sin gamle download + `/logs/upload`-sti.

Plan:

1. Endre `process-dronelog` for action `dji-process-log`
   - Bytt fra:
     - `GET /logs/{accountId}/{logId}/download`
     - lokal nedlasting
     - `POST /logs/upload`
   - Til:
     - `POST /api/v1/logs`
     - JSON body med `url` og `fields`
   - Bruk `downloadUrl` fra listen hvis den finnes, ellers fallback til `${DRONELOG_BASE}/logs/${accountId}/${logId}/download`.

2. Beholde upload-stien kun for manuell filopplasting
   - Nederste delen av `process-dronelog` som håndterer brukeropplastede `.txt/.zip`-filer skal fortsatt bruke `/logs/upload`.
   - Bare DJI Cloud-actionen endres.

3. Forbedre logging og feilmelding
   - Legg inn tydelig logg:
     - `[process-dronelog] processing DJI log via POST /logs (URL-mode)`
   - Hvis DroneLog returnerer feil fra URL-prosessering, returner upstream status og details slik at vi ser om det er `/logs` eller URL-tilgang som feiler.

4. Deploy `process-dronelog`
   - Deploy bare denne edge-funksjonen.
   - Etterpå kan du teste samme DJI-logg på nytt. Da skal loggene ikke lenger inneholde `uploading ... via /logs/upload` for DJI Cloud-valg.

Teknisk endring:

```ts
const logUrl = downloadUrl || `${DRONELOG_BASE}/logs/${accountId}/${logId}/download`;

const res = await fetch(`${DRONELOG_BASE}/logs`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${dronelogKey}`,
    "Content-Type": "application/json",
    Accept: "text/csv, application/json",
  },
  body: JSON.stringify({
    url: logUrl,
    fields: fieldList,
  }),
});
```

Hvis responsen er CSV parses den som før med `parseCsvToResult(csvText)`.