
# Selskapsspesifikke SORA-innstillinger — "Operatørkrav"-fane

## Hva bygges

En ny fane i admin-panelet kalt med selskapets navn (f.eks. "AviSafe AS") der selskaps-admins kan:

1. **Hardstop-grenser** — egne terskelverdier (overstyrer systemdefaults)
2. **Operative begrensninger** — fritekst som sendes direkte til AI (erstatter/supplerer operasjonsmanual)
3. **Tilknyttede policydokumenter** — lenkes til dokumenter fra biblioteket
4. **Dokumentnotater (nøkkelpunkter)** — admin skriver inn de viktigste reglene fra operasjonsmanualen i klartekst, slik at AI alltid kan lese dem uavhengig av filformat

## Dokumentlesing — to-lagsmodell

Dokumenter i systemet er primært PDF-er lagret i Supabase Storage. Siden AI ikke kan lese PDF-binærdata direkte, brukes en kombinasjon:

- **Lag 1 (alltid tilgjengelig)**: `beskrivelse`-feltet fra `documents`-tabellen sendes alltid til AI
- **Lag 2 (klartekst fra admin)**: Et eget `policy_notes`-tekstfelt i `company_sora_config` der admin kan klippe inn/skrive de viktigste reglene fra operasjonsmanualen — dette er det AI faktisk leser og bruker aktivt

Dette gir en pålitelig løsning som fungerer for alle filtyper, og som lar AI bruke selskapets faktiske regler uten å måtte tolke PDF-binærdata.

## Standardverdier (fra gjeldende system)

Fra `### HARD STOP-LOGIKK` i `ai-risk-assessment/index.ts` (linje 742):

| Innstilling | Standardverdi (dagens system) |
|---|---|
| Max vindstyrke (middelvind) | 10 m/s |
| Max vindkast | 15 m/s |
| Max sikt | 1 km (minimum) |
| Max flyhøyde | 120 m AGL (EU-standard) |
| Krever reservebatteri | Nei (false) |
| Krever observatør | Nei (false) |

## Databaseendringer

### Ny migrasjon: `company_sora_config`

```sql
CREATE TABLE company_sora_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,

  -- Hardstop-grenser
  max_wind_speed_ms numeric NOT NULL DEFAULT 10,
  max_wind_gust_ms numeric NOT NULL DEFAULT 15,
  max_visibility_km numeric NOT NULL DEFAULT 1,
  max_flight_altitude_m integer NOT NULL DEFAULT 120,
  require_backup_battery boolean NOT NULL DEFAULT false,
  require_observer boolean NOT NULL DEFAULT false,

  -- Fritekst operative begrensninger (til AI-prompt)
  operative_restrictions text,

  -- Nøkkelpunkter fra operasjonsmanual i klartekst (til AI-lesing)
  policy_notes text,

  -- Tilknyttede dokument-IDs (for referanse og visning)
  linked_document_ids uuid[] NOT NULL DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE company_sora_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own company config"
  ON company_sora_config FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can upsert own company config"
  ON company_sora_config FOR ALL
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- updated_at trigger (følger eksisterende mønster)
CREATE TRIGGER update_company_sora_config_updated_at
  BEFORE UPDATE ON company_sora_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## Nye filer

### `src/components/admin/CompanySoraConfigSection.tsx`

Struktur (tre Collapsible-kort):

**Kort 1: Hardstop-grenser**
- Vindstyrke (slider/input, m/s, default 10)
- Vindkast (slider/input, m/s, default 15)
- Sikt (input, km, default 1)
- Flyhøyde (input, m AGL, default 120)
- Krever reservebatteri (Switch, default av)
- Krever observatør (Switch, default av)

**Kort 2: Operative begrensninger**
- Textarea: "Skriv inn selskapets operative begrensninger som AI-en skal ta hensyn til i risikovurderingen..."
- Eksempel-placeholder: "Selskapet tillater ikke flyging over folkemengder. Alltid krever skriftlig grunneierklarering..."

**Kort 3: Operasjonsmanual / Policydokumenter**
- Dokumentvelger (gjenbruk av `AttachmentPickerDialog`-mønster) — velg dokumenter fra biblioteket for referanse
- `policy_notes` textarea: "Lim inn eller skriv nøkkelpunkter fra operasjonsmanualen som AI-en skal bruke aktivt" — dette er selve innholdet AI leser
- Info-tekst: "AI kan ikke lese PDF-filer direkte. Bruk dette feltet til å legge inn de viktigste reglene i klartekst."

**Lagre-logikk**: `upsert` til `company_sora_config` med `onConflict: 'company_id'`.

## Endringer i eksisterende filer

### `src/pages/Admin.tsx`

1. Hent `companyName` fra `profile.companies.name` (allerede tilgjengelig i AuthContext)
2. Legg til ny `TabsTrigger` — vises kun for `isAdmin` eller `isSaksbehandler`:
```tsx
<TabsTrigger value="company-config">
  <Building2 className="h-4 w-4 mr-1" />
  {companyName || "Selskapet"}
</TabsTrigger>
```
3. Legg til `TabsContent` for `company-config` som renderer `<CompanySoraConfigSection />`

### `supabase/functions/ai-risk-assessment/index.ts`

Etter at `profile` er hentet (~linje 290), legg til:

```ts
// Hent selskapsspesifikk SORA-konfig
const { data: companySoraConfig } = await supabase
  .from('company_sora_config')
  .select(`
    max_wind_speed_ms, max_wind_gust_ms, max_visibility_km,
    max_flight_altitude_m, require_backup_battery, require_observer,
    operative_restrictions, policy_notes, linked_document_ids
  `)
  .eq('company_id', companyId)
  .maybeSingle();

// Hent titler på tilknyttede dokumenter (for referanse)
let linkedDocumentSummary = '';
if (companySoraConfig?.linked_document_ids?.length > 0) {
  const { data: linkedDocs } = await supabase
    .from('documents')
    .select('tittel, beskrivelse, kategori')
    .in('id', companySoraConfig.linked_document_ids);
  linkedDocumentSummary = linkedDocs
    ?.map(d => `- ${d.tittel} (${d.kategori})${d.beskrivelse ? ': ' + d.beskrivelse : ''}`)
    .join('\n') || '';
}
```

Legg til i `contextData`:
```ts
companyConfig: companySoraConfig ? {
  hardStops: {
    maxWindSpeedMs: companySoraConfig.max_wind_speed_ms,
    maxWindGustMs: companySoraConfig.max_wind_gust_ms,
    maxVisibilityKm: companySoraConfig.max_visibility_km,
    maxFlightAltitudeM: companySoraConfig.max_flight_altitude_m,
    requireBackupBattery: companySoraConfig.require_backup_battery,
    requireObserver: companySoraConfig.require_observer,
  },
  operativeRestrictions: companySoraConfig.operative_restrictions || null,
  policyNotes: companySoraConfig.policy_notes || null,
  linkedDocuments: linkedDocumentSummary || null,
} : null,
```

I `systemPrompt`, erstatt hardkodede grenser med dynamiske verdier og legg til ny seksjon:

```
### SELSKAPSINNSTILLINGER (OBLIGATORISK — OVERSTYRER SYSTEM-DEFAULTS)

${companySoraConfig ? `
HARDSTOP-GRENSER (absolutte, ikke forhandlingsbare):
- Max vindstyrke: ${companySoraConfig.max_wind_speed_ms} m/s
- Max vindkast: ${companySoraConfig.max_wind_gust_ms} m/s
- Min sikt: ${companySoraConfig.max_visibility_km} km
- Max flyhøyde: ${companySoraConfig.max_flight_altitude_m} m AGL
- Krever reservebatteri: ${companySoraConfig.require_backup_battery ? 'JA — OBLIGATORISK' : 'Nei'}
- Krever observatør: ${companySoraConfig.require_observer ? 'JA — OBLIGATORISK' : 'Nei'}

Hvis noen av disse overskrides i oppdragsdata, SKAL recommendation="no-go" og hard_stop_triggered=true returneres uavhengig av andre scores.

${companySoraConfig.operative_restrictions ? `OPERATIVE BEGRENSNINGER FRA SELSKAPET:\n${companySoraConfig.operative_restrictions}` : ''}

${companySoraConfig.policy_notes ? `SELSKAPETS OPERASJONSMANUAL — NØKKELPUNKTER (les og bruk aktivt):\n${companySoraConfig.policy_notes}\n\nVurder om oppdraget er i tråd med disse reglene. Nevn avvik eksplisitt i concerns.` : ''}

${linkedDocumentSummary ? `TILKNYTTEDE POLICYDOKUMENTER (referanse):\n${linkedDocumentSummary}` : ''}
` : ''}
```

## Filer som opprettes/endres

| Fil | Type | Endring |
|---|---|---|
| `supabase/migrations/[timestamp]_add_company_sora_config.sql` | Ny | Tabell + RLS + trigger |
| `src/components/admin/CompanySoraConfigSection.tsx` | Ny | UI-komponent |
| `src/pages/Admin.tsx` | Endret | Ny fane med selskapsnavn |
| `supabase/functions/ai-risk-assessment/index.ts` | Endret | Henter og injiserer selskapsconfig |

## Tekniske notater

- Bruker `maybeSingle()` i stedet for `single()` slik at feilen ikke kastes om ingen konfig finnes ennå (lazy creation)
- Hvis `companySoraConfig` er null (selskapet har ikke lagret noen konfig ennå), faller systemet tilbake på eksisterende hardkodede grenser — ingen breaking change
- `policy_notes` er den faktiske AI-lesbare teksten; `linked_document_ids` brukes til å vise hvilke dokumenter som er tilknyttet og for å hente `beskrivelse`-feltet
- Fanen vises for alle admins og saksbehandlere, men ikke for operatører eller lesetilgang
