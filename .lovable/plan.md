# Egendefinert drone: manuelle spesifikasjoner

## Hva du får
Når du velger «Angi manuelt» i dronekatalogen, dukker det opp en egen seksjon «Spesifikasjoner» der du selv kan fylle inn:

- Karakteristisk dimensjon (CD) i meter
- Maks hastighet (m/s)
- Maks vind (m/s)
- Flytid / batteritid (minutter)
- IP-rating (f.eks. IP54) — med «Ikke dokumentert» som standard
- Type: multirotor eller fastvinge
- MTOM (vekt) og nyttelast — disse finnes allerede, men blir nå redigerbare også i manuell modus

Verdiene lagres på dronen og brukes videre på samme måte som katalogdata:
- CD og hastighet brukes i SORA-beregning av buffere og ALOS
- IP-rating vurderes mot nedbør i risikovurderingen (advarsel, aldri hard stop)
- Maks vind og type inngår i SORA-forslag og værvurdering

Velger du en modell fra katalogen, er det fortsatt katalogens verdier som gjelder — seksjonen vises da som lesbar info, ikke som redigerbare felt.

## Slik bygges det

1. **Lagringsplass på dronen**
   Nye felt på dronen for CD, maks hastighet, maks vind, flytid, IP-rating og type, samt en markering av om dronen er katalogbasert eller egendefinert. Databaseendringen legges fram for godkjenning før den kjøres.

2. **Skjemaet**
   Ny «Spesifikasjoner»-seksjon i dronedialogene (både ny drone og redigering). Feltene er redigerbare kun når «Angi manuelt» er valgt; ved katalogmodell vises katalogens verdier med kilde-lenke som i dag.

3. **Bruk i beregninger**
   SORA-panelet og risikovurderingen slår først opp katalogen som i dag. For egendefinerte droner uten katalogtreff brukes dronens egne verdier i stedet, både for CD/hastighet, type og IP-rating mot nedbør.

4. **Tekster**
   Alle nye etiketter og hjelpetekster legges inn på norsk og engelsk.

## Teknisk

- Migrasjon på `public.drones` (krever din godkjenning):
  `spec_source text not null default 'catalog'` ('catalog' | 'manual'),
  `characteristic_dimension_m numeric`, `max_speed_mps numeric`, `max_wind_mps numeric`,
  `endurance_min integer`, `ip_rating text`, `airframe_category text` ('multirotor' | 'fixed_wing').
  Ingen nye tabeller, ingen RLS-endringer (eksisterende `drones`-policyer dekker feltene).
- `src/components/resources/DroneFormFields.tsx`: utvid `DroneFormValues` og `emptyDroneFormValues` med feltene; ny seksjon rendres når `selectedModelId === "manual"` eller `values.spec_source === "manual"`; katalogmodus viser skrivebeskyttet oppsummering (CD, V0, IP, maks vind, flytid).
- `AddDroneDialog.tsx`: `handleModelSelect` setter `spec_source` til `manual`/`catalog` og nullstiller manuelle spesifikasjoner ved katalogvalg; insert sender de nye kolonnene.
- `DroneDetailDialog.tsx`: samme felt i update-payloadet, og seksjonen forblir redigerbar for droner med `spec_source = 'manual'`.
- `src/components/SoraSettingsPanel.tsx`: legg dronens egne felt i `drones`-select og bruk dem som fallback etter `pickBestDroneCatalogMatch` (CD, V0, maks vind, MTOM, `categoryToAircraftType` via `airframe_category`).
- `supabase/functions/ai-risk-assessment/index.ts`: samme fallback for `primaryDroneCharacteristicDimensionM`, `calculateAlos` og IP-/nedbørsvurderingen (`ipPrecipitation.ts`) når katalogtreff mangler; kilde merkes som «operatøroppgitt» i stedet for produsentkilde. Funksjonen deployes p\u00e5 nytt.
- i18n: nye nøkler under `resourceDialogs.droneDetail.*` i `no.json` og `en.json`.
- Validering: `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`, samt `deno test` for risikovurderingsfunksjonen.
