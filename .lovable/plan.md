

## Legg til ECCAIRS attributt 1241 (RPAS/UAS Airspace Type)

### Oversikt
Legge til 8 verdier for ECCAIRS attributt 1241 i taxonomy-databasen, legge til feltet i ECCAIRS-konfigurasjonen, og koble det til auto-mapping ved hendelsesrapportering.

### 1. Sett inn verdier i `eccairs.value_list_items`

Bruk insert-verktøyet for å legge til 8 rader med `value_list_key = 'VL1241'`:

| value_id | value_description | value_synonym |
|----------|------------------|---------------|
| 1 | Atypical airspace | Atypical airspace |
| 2 | In segregated airspace | In segregated airspace |
| 7 | UAS geographical zone | UAS geographical zone |
| 8 | In heliport/airport environment | In heliport/airport environment |
| 9 | Not applicable | Not applicable |
| 10 | Unknown | Unknown |
| 11 | In controlled airspace | In controlled airspace |
| 12 | In uncontrolled airspace | In uncontrolled airspace |

### 2. Legg til felt i `eccairsFields.ts`

Nytt felt i `ECCAIRS_FIELDS`-arrayet under **airspace**-gruppen (etter attributt 15):

```ts
{
  code: 1241,
  label: 'RPAS/UAS luftromstype',
  taxonomyCode: '24',
  entityPath: '3',        // Airspace entity
  format: 'value_list_int_array',
  type: 'select',
  group: 'airspace',
  defaultValue: '12',     // Default: In uncontrolled airspace
  helpText: 'Type luftrom for RPAS/UAS-operasjon (VL1241)'
}
```

### 3. Auto-mapping i `eccairsAutoMapping.ts`

Legg til `rpas_airspace_type` i `SuggestedMapping`-interfacet og logikk i `suggestEccairsMapping()` som foreslår verdi basert på hendelsens kategori:

- Kategori "Luftrom" → `11` (In controlled airspace)
- Default → `12` (In uncontrolled airspace)

### Filer som endres
| Fil | Endring |
|-----|---------|
| Database (insert) | 8 rader i `eccairs.value_list_items` |
| `src/config/eccairsFields.ts` | Nytt felt code 1241 |
| `src/lib/eccairsAutoMapping.ts` | Auto-mapping for rpas_airspace_type |

