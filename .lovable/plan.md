
## Utstyrskategorier pa selskapsniva

### Hva skal gjores
Nar en bruker legger til utstyr og skriver inn en "type", skal denne typen lagres som en gjenbrukbar kategori for selskapet. Neste gang noen i samme selskap oppretter utstyr, vises tidligere brukte typer som valgbare alternativer i en dropdown -- men brukeren kan ogsa skrive inn en ny type.

### Tilnaerming
I stedet for a opprette en ny tabell, henter vi unike typer direkte fra eksisterende utstyr i `equipment`-tabellen for gjeldende selskap. Dette gir automatisk en liste over alle typer som allerede er brukt, uten ekstra databaseendringer.

### Tekniske detaljer

**Ingen databaseendringer** -- vi bruker en `SELECT DISTINCT type FROM equipment WHERE company_id = ?` for a hente eksisterende kategorier.

**Fil: `src/components/resources/AddEquipmentDialog.tsx`**
1. Legg til state for `equipmentTypes` (string-array) og `selectedType` (string).
2. Legg til en `useEffect` som henter unike typer fra `equipment`-tabellen filtrert pa `companyId` nar dialogen apnes.
3. Erstatt `<Input>` for "Type" med en kombinasjon av `<Select>` (med eksisterende typer) og et "Annet"-valg som viser et fritekstfelt for ny type.
4. Ved innsending brukes den valgte typen (enten fra dropdown eller fritekst). Den nye typen lagres automatisk i `equipment`-tabellen og blir tilgjengelig neste gang.

**Fil: `src/components/resources/EquipmentDetailDialog.tsx`**
- Samme tilnaerming for redigeringsmodus: hent eksisterende typer og vis som dropdown med mulighet for fritekst.

### Brukeropplevelse
- Dropdown viser alle typer som allerede finnes for selskapet (f.eks. "Batteri", "Sensor", "Radio")
- Siste alternativ er "Annet..." som lar brukeren skrive inn en ny type
- Ny type blir automatisk tilgjengelig for fremtidige opprettelser
