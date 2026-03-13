

## Forhåndsdefinerte utstyrskategorier

### Problem

Batterilogikken (telemetri, trendvisning, dronekobling) matcher hardkodet mot `type === 'Batteri'`. Men utstyrstypen er fritekst — brukere kan skrive "battery", "batteri", "Batterier" osv., og da vil ingen batterifeatures fungere.

### Løsning

1. **Definere en kanonisk liste med utstyrskategorier** i en ny fil `src/config/equipmentCategories.ts`:

```text
Batteri, Sensor, Radio, Kamera, Lader, Propell, Verneutstyr, Verktøy, Bæresystem, Annet
```

Hver kategori får en `id` (brukt i DB) og et `label` (vist i UI). Batterier merkes med `isBattery: true` for enkel sjekk.

2. **Oppdatere `useEquipmentTypes`-hooken** til å returnere de forhåndsdefinerte kategoriene **pluss** eventuelle egendefinerte typer som allerede finnes i databasen (bakoverkompatibilitet).

3. **Oppdatere `AddEquipmentDialog`** til å vise de forhåndsdefinerte kategoriene i dropdown-en, med "Annet..." som siste valg for egendefinerte typer.

4. **Erstatte alle `type === 'Batteri'`-sjekker** med en hjelpefunksjon `isBatteryType(type: string)` som matcher case-insensitivt mot kjente batteriverdier (`'Batteri'`, `'Battery'`, `'batteri'`). Dette fikser eksisterende data som kan ha variert casing.

### Filer som endres

- **Ny: `src/config/equipmentCategories.ts`** — kanonisk kategoriliste + `isBatteryType()` hjelpefunksjon
- **`src/hooks/useEquipmentTypes.ts`** — merger forhåndsdefinerte + eksisterende typer
- **`src/components/resources/AddEquipmentDialog.tsx`** — bruker forhåndsdefinert liste i Select
- **`src/components/UploadDroneLogDialog.tsx`** — bruker `isBatteryType()` i stedet for `=== 'Batteri'`
- **`src/components/resources/EquipmentDetailDialog.tsx`** — bruker `isBatteryType()`
- **`src/components/resources/EquipmentLogbookDialog.tsx`** — bruker `isBatteryType()`
- **`supabase/functions/dji-process-single/index.ts`** — `.ilike('type', 'batteri')` i stedet for `.eq('type', 'Batteri')`
- **`supabase/functions/dji-auto-sync/index.ts`** — samme ilike-endring

### Ingen databaseendringer nødvendig

Typen lagres fortsatt som fritekst i `equipment.type`. De forhåndsdefinerte kategoriene er kun en UI-konvensjon + robust matching.

