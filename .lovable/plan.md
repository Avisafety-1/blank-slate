

## ECCAIRS-mapping: Rettelser etter tilbakemelding fra Luftfartstilsynet

### Tilbakemeldinger og løsninger

#### 1. Reporting entity (447) og Responsible entity (453) er byttet om

**Nåværende (feil):**
- 447 (Reporting entity) → defaultValue `2133` (Norway CAA)
- 453 (Responsible entity) → defaultValue `6133` (Aircraft operator)

**Korrekt:**
- 447 (Reporting entity) → skal være operatøren, default `6133` (Aircraft operator)
- 453 (Responsible entity) → skal være `2133` (Norway CAA)

**Endring:** Bytt defaultValue mellom de to feltene i `eccairsFields.ts`. Oppdater hjelpetekster tilsvarende.

#### 2. Event type (390) må kodes til nivå 4

Nåværende `EccairsEventTypeSelect` viser kun 7 toppnivå-kategorier (nivå 1). Luftfartstilsynet krever minimum nivå 4 i hierarkiet.

**Løsning:** Erstatt `EccairsEventTypeSelect` med standard `EccairsTaxonomySelect` for VL390, som allerede søker i hele value list-tabellen og returnerer alle nivåer. Fjern den spesialtilpassede komponenten fra renderField-logikken. Auto-mapping i `eccairsAutoMapping.ts` beholdes som utgangspunkt — brukeren velger deretter riktig underkategori.

#### 3. Operator (215) mangler

Feltet finnes ikke i `ECCAIRS_FIELDS`. Må legges til under Aircraft-gruppen (Entity 4) med:
- Format: `value_list_int_array` (VL215)
- Fritekstfelt for operatørnavn: Attributt 216 (Operator name) som `string_array`
- Hjelpetekst som forklarer at man kan velge "Norway - Other/Private operator" og spesifisere i fritekstfeltet

**Nye felt i `eccairsFields.ts`:**
- 215: Operator (VL215, select, entity 4)
- 216: Operatørnavn (string_array, text, entity 4)

Payload-builder trenger ingen endring — den leser allerede alle attributter generisk.

#### 4. Analysis-felter (Risk, oppfølging, konklusjon)

Disse tilhører Entity 14 (Events) i ECCAIRS. Legger til ny gruppe `analysis` med relevante felter:
- 391: Risk Classification (VL391, select, entity 14)
- 393: Assessment (VL393, select, entity 14) — risikovurdering
- 394: Safety recommendation (text_content_array, textarea, entity 14)

Ny feltgruppe `analysis` legges til i `EccairsFieldGroup` og `getOrderedGroups()`.

#### 5. Birdstrike-felter

Birdstrike er en egen entitet (Entity 7) i ECCAIRS. Legger til ny gruppe `birdstrike` med de viktigste feltene:
- 65: Number of birds seen (VL65, select, entity 7)
- 66: Number of birds struck (VL66, select, entity 7)  
- 67: Size of birds (VL67, select, entity 7)
- 68: Species (VL68, select, entity 7)
- 92: Effect on flight (VL92, select, entity 7)

Ny feltgruppe `birdstrike` vises kun når relevant, eller alltid tilgjengelig for utfylling.

### Filer som endres

- **`src/config/eccairsFields.ts`** — Bytt defaults for 447/453, legg til 215, 216, analysis- og birdstrike-felt, nye grupper
- **`src/components/eccairs/EccairsMappingDialog.tsx`** — Fjern spesialbehandling av VL390, bruk standard TaxonomySelect
- **`src/lib/eccairsAutoMapping.ts`** — Oppdater kommentarer (auto-mapping til nivå 1 beholdes som startpunkt)
- **`supabase/functions/_shared/eccairsPayload.js`** — Legg til entity path overrides for nye felt (entity 7 for birdstrike, entity 14 for analysis)

### Teknisk notat
Ingen databaseendringer nødvendig — `incident_eccairs_attributes`-tabellen er allerede generisk og støtter alle attributtkoder og entity paths.

