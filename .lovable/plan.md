

## Legg til Entity 53-attributter: 447, 476, 495, 800, 801, 802, 1064

### Oversikt
Legge til de 7 gjenværende Reporting history-attributtene. Attributt 802 (Report) er av typen "Eccairs Resource Locator" med unlimited multiplicity — dette er for vedlegg/ressurslenker, ikke vanlig tekst. Vi hopper over 802 i UI-skjemaet foreløpig (den håndteres via vedleggsopplasting, ikke manuell input).

### Feltene

| Code | Label | Format | Type | Default | Note |
|------|-------|--------|------|---------|------|
| 447 | Reporting entity | value_list_int_array | select | — | Hvem som rapporterer |
| 476 | Report source | value_list_int_array | select | — | Kilde for rapporten |
| 495 | Reporting form type | value_list_int_array | select | — | Type skjema |
| 800 | Report status | value_list_int_array | select | `7` (Draft) | Statusverdier du oppga |
| 801 | Reporting date | local_date | date | auto fra hendelsesdato | Dato for rapportering |
| 802 | Report (vedlegg) | raw_json | hidden | — | Resource locator, ikke manuell input |
| 1064 | Parties informed | value_list_int_array | select | — | Parter informert |

### 1. Database: Insert VL800 verdier

VL800-verdier som må legges inn (hvis de ikke finnes):
- 1=Preliminary, 2=Open, 3=Closed, 4=Data, 5=Initial notification, 6=Factual, 7=Draft, 8=Closed on issue

### 2. `src/config/eccairsFields.ts`

Legg til 7 nye felt-definisjoner i narrative-gruppen (eller ny `reporting`-gruppe). Alle med `entityPath: '53'`. Felt 802 settes til `type: 'hidden'`.

### 3. `src/lib/eccairsAutoMapping.ts`

- `report_status` → default `7` (Draft)
- `reporting_date` → auto fra hendelsesdato
- Utvid `SuggestedMapping`-interfacet

### 4. `supabase/functions/_shared/eccairsPayload.js`

Legg til entity path overrides for `447, 476, 495, 800, 801, 802, 1064 → 53`.

### Filer som endres

| Fil | Endring |
|-----|---------|
| Database (insert) | VL800 verdier (8 stk) |
| `src/config/eccairsFields.ts` | 7 nye felt under entity 53 |
| `src/lib/eccairsAutoMapping.ts` | Auto-mapping for report_status, reporting_date |
| `supabase/functions/_shared/eccairsPayload.js` | Entity path overrides |

