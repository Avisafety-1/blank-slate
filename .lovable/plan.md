## Mål
Filtrere DJI-logger mot `dji_sync_from_date` allerede i `dji-sync-enqueue` ved å hente datoen ut av filnavnet (`DJIflightrecord_YYYY_MM_DD...`). Da slipper vi nedlasting + parsing av logger eldre enn cutoff, og sparer dronelog API-kall.

## Endringer

### 1. `supabase/functions/dji-sync-enqueue/index.ts`

**Ny hjelpefunksjon** `extractDateFromDjiLog(log)`:
1. Prøv felter i rekkefølge: `log.fileName`, `log.name`, `log.filename`, `log.file`, `log.path`
2. Regex mot strengen: `/(\d{4})[_\-](\d{2})[_\-](\d{2})/` → returner `Date(YYYY, MM-1, DD)`
3. Fallback: `log.date` hvis det finnes
4. Returner `null` hvis ingenting funnet

**Erstatt filterblokken** (linje 157-165):
```ts
for (const log of logs) {
  const logId = log.id || log.logId;
  if (!logId) { skipped++; continue; }
  if (syncFromDate) {
    const d = extractDateFromDjiLog(log);
    if (d && d < syncFromDate) { skipped++; continue; }
    // Hvis vi ikke finner dato i det hele tatt: la den passere
    // (sjelden tilfelle, bedre å laste enn å miste data)
  }
  candidates.push({ dji_log_id: String(logId), log });
}
```

**Lagre datoen** i `payload.log_date` (linje 199) ved å bruke samme `extractDateFromDjiLog(log)` (med ISO-string), så worker/UI får riktig dato uten parsing.

**Fjern** den midlertidige debug-loggingen (linje 139-148) — vi trenger den ikke lenger siden vi ikke er avhengig av å oppdage feltnavnet.

### 2. Ingen worker-endringer
Worker prosesserer kun det enqueue legger inn → automatisk besparelse.

### 3. Re-sync ved endret cutoff
Hvis `dji_sync_from_date` flyttes bakover: neste sync re-scanner hele listen (cap 200), filtreringen er ikke-destruktiv (ingen `skipped_too_old`-markering), så eldre logger plukkes opp og prosesseres normalt.

## Effekt
- Elmea-tilfellet: 135 unødige download+parse-kall unngås, kun 1 list-kall per sync
- Robust mot at DroneLog-API ikke har et `date`-felt i listen (vi har bevis på at debug-loggingen aldri trigget med dato-felt vi forventet)
- Manuell opplasting upåvirket (går ikke via denne funksjonen)

## Risiko / kant-tilfeller
- Logger med uvanlige filnavn (ikke DJI-standard) → faller gjennom filteret og lastes ned. Bedre enn å miste data.
- Tidssone: filnavnet er datoen brukerens enhet skrev filen, ikke UTC. Cutoff er en dato (ikke tidspunkt), så ±1 dag avvik er akseptabelt.