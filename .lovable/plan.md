

# Refaktorering av Oppdrag.tsx (2660 linjer)

## Analyse av filen

Filen inneholder disse logiske blokkene:

| Blokk | Linjer | Beskrivelse |
|---|---|---|
| Imports | 1-69 | 69 importlinjer |
| ChecklistBadges-komponent | 95-123 | Selvstendig sub-komponent |
| PDF constants | 125-139 | `DEFAULT_PDF_SECTIONS` |
| State-deklarasjoner | 141-196 | ~55 linjer med useState |
| Data-fetching | 240-436 | `fetchMissionsForTab`, caching, batch-fetch |
| Filter-logikk | 444-468 | Computed filter options + filtering |
| Event handlers | 470-578 | Edit, SORA, risk, checklist handlers |
| Approval + Delete | 586-650 | `handleSubmitForApproval`, `handleDeleteMission` |
| KML import | 652-688 | `doImportKml`, `handleKmlFileSelected` |
| KMZ export | 690-753 | `exportToKMZ` |
| PDF export | 755-1457 | **700 linjer** - hele PDF-generering |
| JSX: Filter UI | 1467-1551 | Tabs, search, dropdowns |
| JSX: Mission card | 1553-2212 | **660 linjer** - hele mission-kortet |
| JSX: Dialoger | 2219-2654 | ~435 linjer med dialog-instanser |

## Refaktoreringsplan -- 6 steg

Rekkefølgen følger ChatGPT-anbefalingen: rene UI-komponenter forst, deretter dialoger, hjelpere, og data-hook sist. **Ingen funksjonelle endringer** -- kun flytte kode.

---

### Steg 1: Flytt ut rene UI-komponenter

**Nye filer:**

| Fil | Innhold | Fra linjer |
|---|---|---|
| `src/components/oppdrag/OppdragFilterBar.tsx` | Tabs, search, kunde/pilot/drone-filter | 1489-1551 |
| `src/components/oppdrag/MissionCard.tsx` | Ett oppdragskort med all visningslogikk | 1567-2212 |
| `src/components/oppdrag/ChecklistBadges.tsx` | ChecklistBadges sub-komponent | 95-123 |

`MissionCard` tar inn mission-data + callbacks som props. Ingen state-endringer.

---

### Steg 2: Flytt ut dialoger til `components/oppdrag/dialogs/`

**Nye filer:**

| Fil | Innhold | Fra linjer |
|---|---|---|
| `src/components/oppdrag/dialogs/OppdragDialogs.tsx` | Samle-komponent som renderer alle dialoger | 2219-2654 |

Denne komponenten tar inn alle dialog-states og callbacks som props, og renderer:
- AddMissionDialog (add + edit)
- SoraAnalysisDialog
- IncidentDetailDialog
- ExpandedMapDialog
- Delete AlertDialog
- KML replace AlertDialog
- DocumentDetailDialog
- RiskAssessmentTypeDialog
- RiskAssessmentDialog
- Export PDF Dialog
- AddIncidentDialog
- Checklist Picker Dialog
- ChecklistExecutionDialog

---

### Steg 3: Flytt ut hjelpefunksjoner

**Nye filer:**

| Fil | Innhold | Fra linjer |
|---|---|---|
| `src/lib/oppdragPdfExport.ts` | `exportToPDF()` + `DEFAULT_PDF_SECTIONS` | 125-139, 767-1457 |
| `src/lib/oppdragHelpers.ts` | `statusColors`, `incidentSeverityColors`, `incidentStatusColors`, `getAIRiskBadgeColor`, `getAIRiskLabel`, `formatAIRiskScore` | 73-584 (de rene funksjonene) |

`exportToPDF` er 700 linjer og den storste enkeltblokken. Den er helt selvstendig og trenger bare mission-data + supabase-klient.

---

### Steg 4: Flytt data-hook

**Ny fil:**

| Fil | Innhold | Fra linjer |
|---|---|---|
| `src/hooks/useOppdragData.ts` | `fetchMissionsForTab`, real-time subscription, caching, alle mission-relaterte handlers | 240-436, 470-688 |

Denne hooken returnerer:
- `activeMissions`, `completedMissions`, `isLoadingActive`, `isLoadingCompleted`
- `fetchMissions()`
- Alle handlers: `handleEditMission`, `handleDeleteMission`, `handleSubmitForApproval`, `doImportKml`, etc.

---

### Steg 5: Flytt KMZ export

**Ny fil:**

| Fil | Innhold | Fra linjer |
|---|---|---|
| `src/lib/oppdragKmzExport.ts` | `exportToKMZ()` | 690-753 |

---

### Steg 6: Sett sammen -- Oppdrag.tsx blir orchestrator

Etter alle steg ser `Oppdrag.tsx` ca. slik ut (~150 linjer):

```text
imports
Oppdrag = () => {
  const { user, companyId } = useAuth()
  const { missions, isLoading, handlers, filterState } = useOppdragData()
  const dialogState = useState(...)  // dialog open/close

  return (
    <div>
      <OppdragFilterBar ... />
      {missions.map(m => <MissionCard key={m.id} ... />)}
      <OppdragDialogs ... />
    </div>
  )
}
```

## Filstruktur etter refaktorering

```text
src/
  components/
    oppdrag/
      ChecklistBadges.tsx        (~30 linjer)
      MissionCard.tsx             (~660 linjer, kan splittes videre senere)
      OppdragFilterBar.tsx        (~70 linjer)
      dialogs/
        OppdragDialogs.tsx        (~435 linjer)
  hooks/
    useOppdragData.ts             (~450 linjer)
  lib/
    oppdragHelpers.ts             (~60 linjer)
    oppdragPdfExport.ts           (~700 linjer)
    oppdragKmzExport.ts           (~70 linjer)
  pages/
    Oppdrag.tsx                   (~150 linjer)
```

## Risiko og avbotende tiltak

- Ingen funksjonelle endringer -- kun flytte kode og legge til props/returns
- Test etter hvert steg at oppdragssiden fortsatt fungerer
- Steg 1 (UI-komponenter) er lavest risiko og bor gjores forst
- Steg 4 (data-hook) er hoyest risiko og gjores sist
- `MissionCard` pa 660 linjer kan splittes videre i et fremtidig steg (MissionCardHeader, MissionCardResources, etc.)

