## Ny selskapsinnstilling: "Standard kartlag" (revidert migrasjon)

Endringen fra forrige plan er kun i migrasjonen: `propagate_company_settings_to_children()` gjenskapes ordrett fra dagens versjon i databasen, og den nye `default_map_layers`-blokken legges til rett før `RETURN NEW`. Ingen andre blokker røres — SafeSky-blokken beholder sin nåværende `COALESCE(...test_mode, false)`-sammenligning og sin `AND (...)`-filtrering på barnerekkene.

## Datamodell

Migrasjon på `public.companies`:

- `default_map_layers jsonb NOT NULL DEFAULT '{}'::jsonb` — `{ [layer_id]: boolean }` med samme id-er som `MapLayerControl` bruker.
- `propagate_default_map_layers boolean NOT NULL DEFAULT false`.

Deretter `CREATE OR REPLACE FUNCTION public.propagate_company_settings_to_children()` med **eksakt** dagens body (verifisert via `pg_get_functiondef`), utvidet med denne blokken plassert rett før `RETURN NEW`:

```sql
-- default_map_layers (NEW)
IF COALESCE(NEW.propagate_default_map_layers, false) AND (
     NEW.default_map_layers IS DISTINCT FROM OLD.default_map_layers
     OR COALESCE(NEW.propagate_default_map_layers, false)
        IS DISTINCT FROM COALESCE(OLD.propagate_default_map_layers, false)
) THEN
  UPDATE public.companies
     SET default_map_layers = NEW.default_map_layers
   WHERE parent_company_id = NEW.id
     AND default_map_layers IS DISTINCT FROM NEW.default_map_layers;
END IF;
```

SafeSky-blokken forblir uendret (med `COALESCE(NEW.safesky_callsign_test_mode, false)` i sammenligningen, `COALESCE(..., false)` ved UPDATE av `test_mode`, og full `AND (...)`-filtrering på barnerekkene). Ingen andre blokker endres.

## Delt kartlag-katalog (uendret fra forrige plan)

Ny fil `src/config/mapLayers.ts` med én kanonisk liste over alle knappene i `MapLayerControl`, ekstrahert 1:1 fra `layerConfigs.push(...)` i `src/components/OpenAIPMap.tsx`: `airspace`, `rpas`, `nsm`, `aip`, `rmz_tmz_atz`, `restriksjonsomrader`, `fareomrader`, `sikringsobjekter`, `notam`, `verneomrader`, `befolkning`, `tettsteder`, `arealbruk`, `luftfartshindre`, `kraftledninger`, `eiendomsgrenser`, `tensio_luftnett`, `flyplasser`, `drones`, `safesky`, `nais`. `missions/completed_missions/planned_published` er ikke i katalogen (styres av mode).

## OpenAIPMap: bruk selskapets defaults

Uendret fra forrige plan: hent `default_map_layers` for `companyId` én gang ved init, bruk `initialEnabled(id) = companyDefaults[id] ?? MAP_LAYER_CATALOG.find(e => e.id === id)?.defaultEnabled ?? false` i alle `layerConfigs.push({ enabled: … })`-kall. Ingen endring i `MapLayerControl`, `handleLayerToggle` eller de dynamiske mode-styrte lagene.

## Admin-UI

Uendret fra forrige plan: ny `src/components/admin/MapLayerDefaultsSection.tsx`, registrert som `SubSection title="Standard kartlag"` med `Layers`-ikonet i `ChildCompaniesSection.tsx` rett etter "Kartpublisering". Utvid `select(...)`-kallene og `parent.propagate_*`-mappingen med `default_map_layers` og `propagate_default_map_layers` slik at barn-lås og inherit-oppdages likt.

## Verifisering

1. `pg_get_functiondef` etter migrasjonen viser alle eksisterende blokker uendret + én ny `default_map_layers`-blokk rett før `RETURN NEW`.
2. UI-flyt: admin togger lag → lagres i `default_map_layers`; med propagering på blir barn oppdatert; `/kart` viser samme knapper/navn med togglene som selskapets standard.
