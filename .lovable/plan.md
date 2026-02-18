
# Eksport-valg-dialog for PDF-rapport

## Nåværende situasjon

Eksport-dialogen (linje 2319–2354 i `src/pages/Oppdrag.tsx`) er en enkel `AlertDialog` som:
- Bare viser en enkelt checkbox for AI-risikovurdering **hvis oppdraget har `aiRisk`-data**
- Viser ellers bare en tekst uten valgmuligheter

`exportToPDF`-funksjonen (linje 709–1395) inkluderer allerede disse seksjonene i rekkefølge:
1. Kartutsnitt (canvas-basert)
2. Luftromsadvarsler
3. Rutekoordinater
4. Grunnleggende informasjon
5. Kundeinformasjon
6. Personell
7. Droner/fly
8. Utstyr
9. SORA-analyse
10. AI Risikovurdering (kun hvis `includeRisk === true`)
11. Tilknyttede hendelser
12. Flyturer
13. Beskrivelse & Merknader

## Endringer

### 1. Nye state-variabler (erstatter `includeRiskAssessment`)

Erstatt den ene `includeRiskAssessment`-booleanen med et objekt `pdfSections` som holder alle valgene:

```typescript
const [pdfSections, setPdfSections] = useState({
  map: true,
  airspaceWarnings: true,
  routeCoordinates: true,
  basicInfo: true,
  customerInfo: true,
  personnel: true,
  drones: true,
  equipment: true,
  sora: true,
  riskAssessment: true,
  incidents: true,
  flightLogs: true,
  descriptionNotes: true,
});
```

Ved klikk på "Eksporter PDF" settes alle til `true` (default på), så brukeren kan skru av det de ikke vil ha.

### 2. Oppdatert `handleExportPdfClick`

```typescript
const handleExportPdfClick = (mission: Mission) => {
  setExportPdfMission(mission);
  setPdfSections({
    map: true,
    airspaceWarnings: true,
    routeCoordinates: true,
    basicInfo: true,
    customerInfo: true,
    personnel: true,
    drones: true,
    equipment: true,
    sora: true,
    riskAssessment: true,
    incidents: true,
    flightLogs: true,
    descriptionNotes: true,
  });
  setExportPdfDialogOpen(true);
};
```

### 3. Oppdatert `exportToPDF`-signatur

Funksjonen endres fra `(mission, includeRisk: boolean)` til `(mission, sections: typeof pdfSections)` og hvert avsnitt wrappes i en `if (sections.xxx)` sjekk.

### 4. Oppdatert dialog (erstatter `AlertDialog` med `Dialog`)

Siden vi nå har mange valg er en `AlertDialog` for liten. Vi bytter til en vanlig `Dialog` (samme komponent-bibliotek) med et pen layout.

Dialogen viser to grupper av checkbokser:

**Kart og luftrom**
- Kartutsnitt
- Luftromsadvarsler

**Oppdragsdetaljer**
- Grunnleggende informasjon
- Beskrivelse & merknader
- Kundeinformasjon

**Ressurser**
- Personell
- Droner/fly
- Utstyr

**Rute**
- Rutekoordinater
- SORA-analyse

**Vurderinger og logger**
- AI Risikovurdering *(vises kun hvis `exportPdfMission?.aiRisk` finnes)*
- Tilknyttede hendelser
- Flyturer

Hver gruppe vises med en liten seksjonstittel i grått, og checkboksene bruker den eksisterende `Checkbox`-komponenten som allerede er importert.

En "Velg alle / Fjern alle"-lenke øverst gjør det enkelt å toggle alt.

### 5. Seksjonene som skjules betinget

Checkboks-alternativene som er avhengig av at data faktisk finnes:

| Valg | Vises kun hvis |
|---|---|
| Kartutsnitt | `effectiveLat && effectiveLng` |
| Luftromsadvarsler | alltid (hentes dynamisk) |
| Rutekoordinater | `mission.route?.coordinates?.length > 0` |
| Kundeinformasjon | `mission.customers` |
| SORA-analyse | `mission.sora` |
| AI Risikovurdering | `mission.aiRisk` |
| Tilknyttede hendelser | `mission.incidents?.length > 0` |
| Flyturer | `mission.flightLogs?.length > 0` |
| Grunnleggende info | alltid |
| Personell | `mission.personnel?.length > 0` |
| Droner/fly | `mission.drones?.length > 0` |
| Utstyr | `mission.equipment?.length > 0` |
| Beskrivelse & merknader | `mission.beskrivelse \|\| mission.merknader` |

Seksjoner som ikke har data vises ikke i dialogen (ingen mening i å velge dem).

## Filer som endres

| Fil | Endring |
|---|---|
| `src/pages/Oppdrag.tsx` | Erstatt `includeRiskAssessment` med `pdfSections`-objekt, oppdater dialog og `exportToPDF`-logikk |

Ingen nye filer eller biblioteker trengs – alle komponenter (`Dialog`, `Checkbox`, `Button`) er allerede importert og i bruk.
