## Mål
Skjule kartlaget "Luftnett Tensio" fra alle selskaper unntatt Tensio-hierarkiet, både i kartet og i selskapsinnstillingen "Standard kartlag".

## Situasjon i dag
- `OpenAIPMap.tsx` bygger allerede Tensio-laget kun når `isTensioHierarchy` er sant (sjekker `companyName`/`parentCompanyName` for "tensio"). Andre selskaper ser aldri knappen i kartmenyen — så kartsiden er allerede riktig.
- `src/config/mapLayers.ts` lister `tensio_luftnett` uten begrensning, så det vises i admin-innstillingen "Standard kartlag" for alle selskaper.
- `MapLayerDefaultsSection.tsx` bruker hele katalogen som den er.

## Endringer

1. **`src/config/mapLayers.ts`**
   - Utvid `MapLayerCatalogEntry` med et valgfritt felt `restrictedToCompanyNameContains?: string` (kan senere gjenbrukes for andre restriksjoner).
   - Sett `restrictedToCompanyNameContains: "tensio"` på `tensio_luftnett`-oppføringen.
   - Ekstra hjelper `isLayerAvailableForCompany(entry, companyName, parentCompanyName)` som returnerer `true` når feltet mangler, ellers krever at navnet matcher (case-insensitive) på selskap eller foreldreselskap.

2. **`src/components/admin/MapLayerDefaultsSection.tsx`**
   - Hent i tillegg `name` og `parent:companies!parent_company_id(name)` fra `companies`-raden som allerede lastes.
   - Filtrer `MAP_LAYER_CATALOG` gjennom `isLayerAvailableForCompany(...)` før gruppering, slik at Tensio-laget kun vises for Tensio-selskaper og deres underavdelinger.
   - Ingen andre endringer i UI, propagering, eller lagring.

3. **Ingen migrasjon / ingen kartendringer**
   - Kartsiden gater allerede laget korrekt via `isTensioHierarchy`; propagert `default_map_layers` fra et Tensio-morselskap ned til Tensio-avdelinger fungerer uendret.
   - Ikke-Tensio-selskaper kan uansett ikke aktivere laget i kartet, og etter denne endringen kan de heller ikke se eller togle det i admin-innstillingen.

## Verifisering
- Åpne selskapsinnstillinger som ikke-Tensio-selskap → "Luftnett Tensio" skal ikke være i listen under "Standard kartlag" › "Infrastruktur".
- Åpne som Tensio (eller Tensio-underavdeling) → laget vises og kan togles/propageres som før.
- `/kart` uendret for alle.
