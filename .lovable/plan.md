

## Legg til ECCAIRS attributter 1376, 1388 og 1238 under Entity 4 (Aircraft)

### Oversikt
Tre nye RPAS/UAS-relaterte attributter under Aircraft-entiteten (4):

| Code | Label | Verdier |
|------|-------|---------|
| 1376 | UAS operation authorization type | 14 stk (SORA, STS 01/02, PDRA-S01/S02/G01/G02/G03, LUC, Other, N/A, Unknown) |
| 1388 | Control mode of RPAS/UAS | 8 stk (Autonomous, Automatic, Waypoint, Manual, Transitioning, N/A, Unknown, Not applicable) |
| 1238 | RPAS/UAS Characteristic Dimension | 7 stk (<1m, 1-3m, 3-8m, 8-20m, 20-40m, 40m+, Unknown) |

### 1. Database: Insert verdier

**VL1376** (14 rader):
- 1=SORA, 2=PDRA, 3=Not applicable, 4=Other, 5=Unknown, 6=STS 01, 7=STS 02, 8=PDRA-S01, 9=PDRA-S02, 10=PDRA-G01, 11=PDRA-G02, 12=PDRA-G03, 13=LUC

**VL1388** (8 rader):
- 1=Autonomous, 2=Automatic, 3=Waypoint flying, 4=Manual control, 5=Transitioning between modes, 6=Not applicable, 7=Unknown, 8=Not applicable

**VL1238** (7 rader):
- 1=less than 1m, 2=1m to less than 3m, 3=3m to less than 8m, 4=8m to less than 20m, 5=20m to less than 40m, 6=40m or more, 7=Unknown

### 2. `src/config/eccairsFields.ts`

Legg til 3 nye felt i `aircraft`-gruppen, alle med `entityPath: '4'`:

```
{ code: 1376, label: 'UAS driftstillatelsestype', format: 'value_list_int_array', type: 'select', group: 'aircraft', entityPath: '4' }
{ code: 1388, label: 'Kontrollmodus RPAS/UAS', format: 'value_list_int_array', type: 'select', group: 'aircraft', entityPath: '4' }
{ code: 1238, label: 'RPAS/UAS karakteristisk dimensjon', format: 'value_list_int_array', type: 'select', group: 'aircraft', entityPath: '4' }
```

### 3. `src/lib/eccairsAutoMapping.ts` (valgfritt)

Kan auto-mappe basert på oppdragsdata:
- 1376: Hvis oppdrag har SORA-analyse → `1` (SORA), ellers `3` (Not applicable)
- 1388: Default `4` (Manual control)
- 1238: Default `1` (less than 1m) for typiske droner

### Filer som endres

| Fil | Endring |
|-----|---------|
| Database (insert) | VL1376 (14), VL1388 (8), VL1238 (7) verdier |
| `src/config/eccairsFields.ts` | 3 nye felt under aircraft-gruppen |
| `src/lib/eccairsAutoMapping.ts` | Evt. auto-mapping for de nye feltene |

