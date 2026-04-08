

## Legg til ECCAIRS-felt 1088, 455, 1070, 1069

### Nye felt

**Entity 24 (Occurrence) — `entityPath: null`:**

1. **1088 — Aviation sector**: `format: 'value_list_int_array'`, `type: 'select'`, `group: 'classification'`, Multiple Values: Unlimited. helpText: «Relatert luftfartssektor (VL1088)»
2. **455 — Occurrence status**: `format: 'value_list_int_array'`, `type: 'select'`, `group: 'classification'`, Single value. helpText: «Status på hendelsen (VL455)»

**Entity 53 (Reporting History) — `entityPath: '53'`:**

3. **1070 — Conclusions**: `format: 'text_content_array'`, `type: 'textarea'`, `group: 'analysis'`. helpText: «Konklusjoner fra organisasjonen»
4. **1069 — Risk mitigation action**: `format: 'text_content_array'`, `type: 'textarea'`, `group: 'analysis'`. helpText: «Forebyggende, korrigerende eller utbedrende tiltak for å redusere risiko»

### Fil som endres
- **`src/config/eccairsFields.ts`** — Legg til de 4 feltene i ECCAIRS_FIELDS-arrayet på riktige steder (1088/455 i classification-gruppen, 1069/1070 i analysis-gruppen)

Ingen payload-endringer nødvendig — feltene bruker standard formater som allerede støttes.

