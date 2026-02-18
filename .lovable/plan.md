
## Flytt «Importer KML» til riktig sted og legg til i ruteplanlegger

### Hva endres

**1. `MissionDetailDialog.tsx`** — Fjern KML-knappen fra topphodet
- Fjern `<input ref={kmlInputRef}>` og `<Button>Importer KML/KMZ</Button>` fra header-seksjonen (linje 205–215)
- Beholde all state (`importingKml`, `pendingKmlFile`, `kmlInputRef`, `doImportKml`, `handleKmlFileSelected`) fordi den samme logikken kan gjenbrukes fra `Oppdrag.tsx`-siden

Alternativt: Siden `Oppdrag.tsx` er der «Flere valg»-dropdown finnes, og den siden håndterer egne oppdragskort, flyttes hele KML-import-logikken dit. `MissionDetailDialog` trenger ikke lenger KML-logikk — den brukes bare som visningsdialog fra dashbordet.

**Valg:** Flytte KML-import *bort* fra `MissionDetailDialog` og inn i `Oppdrag.tsx` der «Flere valg»-dropdownen er. `MissionDetailDialog` ryddes for KML-kode (knapp, state, refs, handlers, `AlertDialog` for bekreftelse).

---

### Berørte filer

#### `src/components/dashboard/MissionDetailDialog.tsx`
- Fjern `Upload`-import fra lucide-react
- Fjern `parseKmlOrKmz`-import
- Fjern state: `importingKml`, `replaceRouteConfirmOpen`, `pendingKmlFile`, `kmlInputRef`
- Fjern funksjoner: `doImportKml`, `handleKmlFileSelected`
- Fjern knappen og hidden input fra header
- Fjern `AlertDialog` for rutebekreftelse (den med "Erstatt rute?")

#### `src/pages/Oppdrag.tsx`
- Importer `parseKmlOrKmz` fra `@/lib/kmlImport`
- Importer `Upload` fra lucide-react
- Legg til state: `kmlImportMissionId: string | null`, `importingKml: boolean`, `replaceRouteConfirmOpen: boolean`, `pendingKmlFile: File | null`, og en `useRef<HTMLInputElement>` per fil
- Siden det er én `<input type="file">` per dropdown-instans er ikke trivielt, bruker én delt hidden `<input>` plassert utenfor lista, med `kmlImportMissionId` for å vite hvilket oppdrag som importeres til
- Legg til `doImportKml(file, missionId)` og `handleKmlFileSelected(e)` — disse oppdaterer `route`-kolonnen og setter `latitude`/`longitude` til første koordinat hvis oppdraget ikke har koordinater fra før
- **Auto-startpunkt**: Etter vellykket import, hvis `mission.latitude` er null, kjøres en ekstra `update` med `latitude` og `longitude` fra `parsed.coordinates[0]`
- Legg til nytt `DropdownMenuItem` mellom «Eksporter KMZ» og separator: «Importer KML/KMZ» — alltid synlig (ikke bare når rute finnes)
- Legg til bekreftelsesdialog (AlertDialog) for "Erstatt eksisterende rute?" — gjenbruk samme mønster som ble fjernet fra MissionDetailDialog
- Legg til `<input type="file" className="hidden" ref={kmlInputRef} accept=".kml,.kmz" onChange={handleKmlFileSelected}>` et sted i JSX utenfor lista

#### `src/pages/Kart.tsx`
- Importer `parseKmlOrKmz` fra `@/lib/kmlImport`
- Importer `Upload` fra lucide-react
- Legg til state: `importingKml: boolean`
- Legg til en hidden `<input type="file">` og `useRef`
- Legg til `handleKmlImport(file)`:
  - Parser filen
  - Setter `currentRoute` til parsede koordinater (samme format som manuell rute)
  - **Auto-startpunkt**: Sett `pilotPosition` til første koordinat? Nei — «rutepunkt 1 som startpunkt» betyr at `initialCenter` settes til første koordinat så kartet zoomer dit. Alternativt: send `setCurrentRoute` med den parsede ruten slik at kartet viser ruten umiddelbart
- Legg til «Importer KML/KMZ»-knapp i ruteplanlegger-toolbaren (i gruppen med Pilot og NOTAM)

### Auto-startpunkt (koordinat 1 som rutestart)
Ved import i `Oppdrag.tsx`: Hvis `mission.latitude` er null, oppdater også `latitude` og `longitude` i databasen med første koordinat, slik at kart og AirspaceWarnings vises.

Ved import i `Kart.tsx` (ruteplanlegger): Ruten settes direkte i `currentRoute`-state. Kartet følger allerede ruten. Ingen database-lagring her — kartet er i planleggingsmodus og ruten lagres kun når brukeren trykker «Lagre».

### Plassering av KML-knapp i Kart.tsx toolbar
Legges inn mellom Pilot-knappen og NOTAM-knappen:
```
[Pilot]  [Importer KML]  [NOTAM]  |  [Angre]  [Nullstill]  |  [Avbryt]  [Lagre]
```

### Ingen databasemigrasjoner nødvendig
Alt er frontend-logikk og oppdatering av eksisterende kolonner (`route`, `latitude`, `longitude`).
