## Ny selskapsinnstilling: "Standard kartlag"

Legger til en ny `SubSection` under Selskapsinnstillinger i `ChildCompaniesSection.tsx` som lar admins bestemme hvilke kartlag/knapper som er togget på som standard når brukere åpner `/kart`. Innstillingen skal kunne propageres til underavdelinger (samme mønster som SORA-buffersone, roller, flylogg-varsler osv.).

Listen som vises i selskapsinnstillingen er **eksakt den samme** som vises i `MapLayerControl` på `/kart` — samme id, samme visningsnavn, samme gruppe, samme rekkefølge, samme ikon. Én knapp = én toggle, selv når den knappen internt aktiverer flere Leaflet-lag (f.eks. `restriksjonsomrader` = `caaRestriksjonerLayer + dkRodLayer`, `notam` = `notamLayer + caaNotamSonerLayer`). Det er nettopp knappene fra `MapLayerControl` som togges — ikke de underliggende Leaflet-lagene.

## Datamodell

Migrasjon som legger til to kolonner på `public.companies`:

- `default_map_layers jsonb NOT NULL DEFAULT '{}'` — map `{ [layer_id]: boolean }` der `layer_id` er den samme id-en som `MapLayerControl` bruker (`airspace`, `rpas`, `notam`, `verneomrader`, …). Nøkler som mangler = arv fra hardkodet default (bakoverkompat + nye lag får sin naturlige default uten migrering).
- `propagate_default_map_layers boolean NOT NULL DEFAULT false`.

Utvid `public.propagate_company_settings_to_children()` med en blokk som — når `propagate_default_map_layers` er på og enten `default_map_layers` eller togglen selv endret seg — kopierer `default_map_layers` til alle direkte barn (`parent_company_id = NEW.id`). Samme SECURITY DEFINER-mønster som eksisterende blokker; ingen RLS-endring nødvendig.

## Delt kartlag-katalog (én kilde til sannhet)

Ny fil `src/config/mapLayers.ts` med én kanonisk liste over alle knappene som `MapLayerControl` viser, ekstrahert 1:1 fra dagens `layerConfigs.push(...)`-kall i `src/components/OpenAIPMap.tsx`:

```ts
export interface MapLayerCatalogEntry {
  id: string;              // "airspace", "rpas", "notam", …  (samme id som i MapLayerControl)
  name: string;            // "Luftrom", "RPAS 5 km", …       (samme visningsnavn)
  group: string;           // "Luftrom", "Restriksjoner", …    (samme gruppe)
  icon: string;            // eksisterende iconMap-nøkler
  defaultEnabled: boolean; // fallback når selskapet ikke har overstyrt
}
export const MAP_LAYER_CATALOG: MapLayerCatalogEntry[] = [ … ];
```

Katalogen inkluderer alle knappene som pushes i OpenAIPMap i dag: `airspace`, `rpas`, `nsm`, `aip`, `rmz_tmz_atz`, `restriksjonsomrader`, `fareomrader`, `sikringsobjekter`, `notam`, `verneomrader`, `befolkning`, `tettsteder`, `arealbruk`, `luftfartshindre`, `kraftledninger`, `eiendomsgrenser`, `tensio_luftnett`, `flyplasser`, `drones`, `safesky`, `nais`.

**Ikke inkludert** (styres av mode/kontekst, ikke av admin): `missions`, `completed_missions`, `planned_published`.

Admin-UI-et og OpenAIPMap importerer **samme** `MAP_LAYER_CATALOG`, så navn/rekkefølge/gruppering kan ikke drifte fra hverandre.

## OpenAIPMap: bruk selskapets defaults

I `src/components/OpenAIPMap.tsx`:

1. Hent selskapets `default_map_layers` én gang når kartet initialiseres (`useQuery` mot `companies.default_map_layers` for `companyId` fra `useAuth()`).
2. Erstatt hardkodet `enabled: true/false` i alle `layerConfigs.push({ … })`-kall (linje 857–1038) med en helper `initialEnabled(id)` som gjør `companyDefaults[id] ?? MAP_LAYER_CATALOG.find(e => e.id === id)?.defaultEnabled ?? false`.
3. Behold dagens spesialtilfeller uendret: `tensio_luftnett` pushes fortsatt kun når selskapet er norsk, og `missions/completed_missions/planned_published` beholder `modeRef.current === "view"`-logikken.
4. `MapLayerControl` og `handleLayerToggle` er uendret — brukerens run-time toggle er fortsatt lokal state (påvirker ikke selskapets standard).

## Admin-UI

Ny komponent `src/components/admin/MapLayerDefaultsSection.tsx` (samme struktur som `MapPublicationDefaultsCard`):

- Leser `companies.default_map_layers` og `propagate_default_map_layers` for gjeldende selskap.
- Rendrer katalogen gruppert etter `group` i **samme rekkefølge** som `MapLayerControl.GROUP_ORDER` (`Luftrom`, `Restriksjoner`, `Natur & befolkning`, `Infrastruktur`, `Live trafikk`, `Annet`).
- Hver rad: ikon + navn (identisk med `/kart`) + `Switch` som viser effektiv verdi (`default_map_layers[id] ?? defaultEnabled`).
- Toggle skriver full jsonb inkl. den endrede nøkkelen tilbake, invalidér relevant query, bump `updated_at`.
- Nederst: `Switch` "Del med underavdelinger" bundet til `propagate_default_map_layers`. Når moderavdelingen har propagering på, låses hele seksjonen for barn (samme UX som `fh2Locked` / `parentPropagatesRoles`).

Registrer den som ny `SubSection title="Standard kartlag"` med `Layers`-ikonet i `ChildCompaniesSection.tsx`, plassert rett etter "Kartpublisering" (linje ~2045). Utvid `select(...)`-kallene på linje 427 og 473, og `parent.propagate_*`-mappingen ved linje 512–535, med de to nye feltene slik at barn-status og inherit-lås oppdages likt som for de andre feltene.

## Ingen andre endringer

- Ingen RLS-endring.
- Ingen ny edge function.
- Ingen endring i `AuthContext` (kartsiden gjør sin egen fetch).
- Ingen endring i `MapLayerControl.tsx`.

## Verifisering

1. Åpne selskapsinnstilling → "Standard kartlag" viser nøyaktig samme knapper/grupper/navn som `/kart`-menyen.
2. Skru av "Verneområder" og på "Kraftledninger" → lagres i `default_map_layers`.
3. Refresh `/kart`: knappen for kraftledninger står togglet på, verneområder av; menyen viser samme navn.
4. Skru på "Del med underavdelinger" → trigger propagerer JSON-en til alle barn; brukere i underavdeling får samme oppsett.
5. Ny bruker uten override: alle knapper oppfører seg som før (fallback til `defaultEnabled`).
