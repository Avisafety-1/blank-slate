

## Problem

API-et returnerer logger med feltnavn som `aircraftName`, `fileName`, `totalTime`, `timestamp`, men DjiLog-interfacet og UI-en forventer `aircraft`, `date`, `duration`. Siden rå API-objektene lagres direkte uten mapping, blir alle felt `undefined` og viser "Ukjent drone".

## Endringer

### `src/components/UploadDroneLogDialog.tsx`

1. **Oppdater DjiLog-interfacet** til å inkludere API-feltene (`aircraftName`, `fileName`, `totalTime`, `totalDistance`, `maxHeight`, `timestamp`, `downloadUrl`).

2. **Legg til mapping i `fetchDjiLogs`** etter linje 440 — map rå API-objekter til DjiLog-format:
```typescript
const mapped = logs.map((l: any) => ({
  id: l.id,
  date: l.timestamp ? format(new Date(l.timestamp), 'dd.MM.yyyy HH:mm') : l.date || '',
  duration: l.totalTime ? Math.round(l.totalTime / 1000) : l.duration || 0,
  aircraft: l.aircraftName || l.aircraft || '',
  fileName: l.fileName || '',
  totalDistance: l.totalDistance || 0,
  maxHeight: l.maxHeight || 0,
  url: l.downloadUrl || l.url || '',
}));
```

3. **Oppdater visningen** (linje ~1189) til å vise `aircraftName` og `fileName`:
```
{log.aircraft || log.fileName || 'Ukjent drone'}
```
Og vis filnavn som undertekst dersom aircraft finnes:
```
{log.fileName && <span className="text-xs text-muted-foreground">{log.fileName}</span>}
```

4. **Vis ekstra metadata** i listen: totalDistance og maxHeight der tilgjengelig.

