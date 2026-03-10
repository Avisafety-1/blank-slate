

## Fix: Vis oppdragslisten uavhengig av valgt flylogg

### Problem
Linje 2236 har betingelsen `{!matchedLog && matchedMissions.length > 0 && (` — oppdragslisten skjules når `matchedLog` er satt. Når SHA-256-duplikaten pre-selecter en eksisterende logg, settes `matchedLog` automatisk, og oppdragslisten forsvinner. Den dukker først opp igjen når brukeren velger «Legg til som ny flytur» (som nuller `matchedLog`).

### Løsning
Fjern `!matchedLog`-betingelsen fra linje 2236 slik at oppdragslisten alltid vises når `matchedMissions.length > 0`. Brukeren kan da alltid se og bytte oppdrag, eller velge «Opprett nytt oppdrag», uavhengig av om en flylogg er pre-valgt.

### Endring
**`src/components/UploadDroneLogDialog.tsx`** — linje 2236:
- Fra: `{!matchedLog && matchedMissions.length > 0 && (`
- Til: `{matchedMissions.length > 0 && (`

