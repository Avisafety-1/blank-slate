

## Lagre DroneLog API-feltreferanse og fikse celleavvik

### Funn

API-et har tre dedikerte felter vi ikke bruker:

| Felt | Beskrivelse | Prioritet |
|------|-------------|-----------|
| `BATTERY.cellVoltageDeviation [V]` | Celleavvik per rad (beregnet av API) | Must-have |
| `BATTERY.isCellVoltageDeviationHigh` | Boolean-flagg når avvik er over terskel | Must-have |
| `BATTERY.maxCellVoltageDeviation [V]` | Maks avvik i hele flyturen | Useful |

**Nåværende problem:** Koden beregner celleavvik manuelt fra `cellVoltage1-6`, men:
1. API-et støtter opptil **14 celler** -- vi sjekker bare 6
2. API-et tilbyr ferdigberegnet avvik som er mer pålitelig
3. Vi bruker unødvendig båndbredde på å hente 6 individuelle cellespenninger

### Plan

**1. Lagre Excel-filen som referansedokument**
- Kopiere `dronelogapi_feltoversikt_sokbar.xlsx` til `docs/`

**2. Oppdatere `docs/dronelog-api-fields.md`** med de nye feltene fra Excel-filen (cellVoltageDeviation, isCellVoltageDeviationHigh, maxCellVoltageDeviation, celler 7-14)

**3. Fikse `supabase/functions/process-dronelog/index.ts`**
- Legge til `BATTERY.cellVoltageDeviation [V]` og `BATTERY.isCellVoltageDeviationHigh` i FIELDS-listen
- Bruke API-ets ferdigberegnede avvik i stedet for manuell beregning
- Beholde manuell beregning som fallback dersom API-feltet returnerer tom verdi
- Fjerne individuelle cellVoltage1-6 fra FIELDS (ikke lenger nødvendig som primærkilde)

**4. Fikse `supabase/functions/dji-auto-sync/index.ts`**
- Samme endringer som process-dronelog

**5. Deploy begge edge-funksjonene**

### Teknisk detalj

```text
Before (manuell beregning fra 6 celler):
  FIELDS: cellVoltage1..6 → manuelt max-min per rad → maxBattCellDev

After (API-beregnet + fallback):
  FIELDS: cellVoltageDeviation, isCellVoltageDeviationHigh, maxCellVoltageDeviation
  → Bruk API-verdien direkte
  → Fallback til manuell beregning fra cellVoltage1-6 hvis feltet er tomt
```

Warnings-logikken forblir uendret (terskel > 0.1V), men vi får nå korrekt avvik for droner med 7-14 celler (enterprise-modeller).

