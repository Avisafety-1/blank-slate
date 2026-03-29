

## Legg til ECCAIRS attributt 1091 og 1092 (Reporter's language / description)

### Analyse

Nåværende oppsett bruker attributt 424 (Narrative language) og 425 (Narrative text) under entity `22` (Narrative). Dette er **korrekt for selve narrativet**, men ECCAIRS har også separate attributter for **rapportørens egen beskrivelse** under "Reporting history" entity (`53`):

- **1091** – Reporter's language (PredefinedValueList, bruker VL424-verdier aka "V4 CD Languages")
- **1092** – Reporter's description (fritekst)

Attributt 424/425 bør **beholdes** (de er riktige for Narrative entity). 1091/1092 er tilleggsfelter under Reporting history.

### 1. Database: Insert VL1091 verdier

1091 bruker "V4 CD Languages" som er **samme verdiliste som VL424**. Vi trenger å legge inn verdier med `value_list_key = 'VL1091'`. Minimum:
- `43` = Norwegian
- `13` = English

(Kan kopiere alle VL424-verdier til VL1091, eller bare de mest relevante.)

### 2. Kode: `src/config/eccairsFields.ts`

Legg til to nye felter i narrative-gruppen:

```ts
{
  code: 1091,
  label: 'Rapportørens språk',
  taxonomyCode: '24',
  entityPath: '53',        // Reporting history entity
  format: 'value_list_int_array',
  type: 'select',
  group: 'narrative',
  defaultValue: '43',      // Norwegian
  helpText: 'Språket rapportørens beskrivelse er skrevet på (VL1091)'
},
{
  code: 1092,
  label: 'Rapportørens beskrivelse',
  taxonomyCode: '24',
  entityPath: '53',        // Reporting history entity
  format: 'text_content_array',
  type: 'textarea',
  group: 'narrative',
  helpText: 'Rapportørens egen beskrivelse av hendelsen',
  autoFromField: 'beskrivelse'
}
```

### 3. Kode: `src/lib/eccairsAutoMapping.ts`

Legg til auto-mapping slik at `beskrivelse` også fyller 1092, og språk settes til norsk (43) som default.

### 4. Payload-builder: `eccairsPayload.js`

Legg til entity path override for 1091/1092 → entity `53` i `ENTITY_PATH_OVERRIDES`.

### Om eksisterende 424/425

Attributt 424/425 er **korrekte** for Narrative entity (22) og bør beholdes. 1091/1092 er et supplement under Reporting history (53). Begge bør sendes.

### Filer som endres

| Fil | Endring |
|-----|---------|
| Database (insert) | VL1091 verdier (minst `43`=Norwegian, `13`=English) |
| `src/config/eccairsFields.ts` | To nye felt: 1091, 1092 |
| `src/lib/eccairsAutoMapping.ts` | Auto-mapping for reporter language/description |
| `supabase/functions/_shared/eccairsPayload.js` | Entity path override for 1091, 1092 → `53` |

