# Utvidet info om verneområder og nasjonalparker i kartet

## Bekreftelse
- **Ingen nye kartlag.** Vi bruker eksisterende `naturvern_zones`-laget (Naturbase) uendret — kun rikere data i popup/dialog.
- Vi legger ikke til Artsdatabanken eller andre nye togglebare lag i denne runden.

## Kilder vi bruker

Etter din input dropper vi Lovdata-lenken som eget felt — Naturbase **faktaark** er den enkleste og mest leservennlige inngangen, og inneholder allerede forskrift, vernedato, formål, kart, forvaltningsmyndighet og lenker videre.

**Primær kilde (per område)**
- **Naturbase faktaark**: `https://faktaark.naturbase.no/?id=<external_id>` — én knapp i popup ("Åpne faktaark"). Dette erstatter både Lovdata- og "faktaark/forskrift"-knappene fra forrige plan.

**Generell informasjon (samme for alle drone-piloter)**
- **Miljødirektoratet – Regler for droner i naturen**: `https://www.miljodirektoratet.no/ansvarsomrader/vernet-natur/regler-for-droner-i-naturen/` — vises som "Regler for droner i verneområder" lenke i popup, lik for alle naturvern-områder.

**Kontaktinfo for søknad om dispensasjon**
- Forvaltningsmyndighet hentes fra Naturbase-attributtene (felt `forvaltningsmyndighet`).
- For nasjonalparker og store landskapsvernområder med eget styre: kuratert seed med kontaktinfo fra **nasjonalparkstyre.no** (telefon, e-post, søknads-URL) som overstyrer/utfyller Naturbase-feltet.
- For naturreservater uten eget styre: fallback til Statsforvalteren i fylket (mapping fra fylkeskode).

## Hva som faktisk bygges

### Backend
- Utvid `naturvern_zones` med nullable-kolonner: `vernedato date`, `iucn_kategori text`, `forvaltningsmyndighet text`, `forvaltningsmyndighet_url text`, `forvaltningsmyndighet_epost text`, `forvaltningsmyndighet_tlf text`, `dispensasjon_url text`, `formaal text`.
  - (Ikke `forskrift_url` / `faktaark_url` — faktaark genereres fra `external_id`.)
- Oppdater sync-edge-function for Naturbase til å mappe de nye feltene fra WFS-responsen.
- Seed-migrasjon `naturpark_forvaltning_seed` med kontaktinfo fra nasjonalparkstyre.no for de ~40 nasjonalparkene og store landskapsvernområdene; oppslag på `name` + `verneform`. Brukes som overstyring/utfylling.
- `get_naturvern_in_bounds` returnerer alle nye felter + en utledet `faktaark_url` basert på `external_id`.

### Frontend
- `fetchNaturvernZones` i `src/lib/mapDataFetchers.ts` — utvidet popup med:
  - Verneform-badge med eksisterende fargekode.
  - Kort regel-tekst basert på `verneform` (fra ny `src/lib/natureProtectionRules.ts`), f.eks. "Nasjonalpark: droneflyging er som hovedregel forbudt uten dispensasjon."
  - Formål (kort, fra Naturbase) hvis tilgjengelig.
  - Forvaltningsmyndighet med klikkbar `tel:` / `mailto:`.
  - Knapperad: **Åpne faktaark** (Naturbase), **Søk dispensasjon** (forvaltningsmyndighet_url/dispensasjon_url), **Regler for droner i verneområder** (Miljødirektoratet generell side).
  - "Vis detaljer"-lenke → `NatureAreaDetailDialog` for mobilvennlig fullvisning (lazy-loaded).
- Auto-reveal (`routeProximityLayers.ts`) uendret.

### Tekster
- `src/lib/natureProtectionRules.ts` — sentralt regelsett per `verneform` (kort norsk regel + lovhjemmel-referanse i klartekst, ingen Lovdata-URL).

## Tekniske detaljer

```text
Naturbase WFS-felt → DB-kolonne
  vernedato             → vernedato
  iucn                  → iucn_kategori
  forvaltningsmyndighet → forvaltningsmyndighet
  formaal               → formaal
  (external_id)         → brukt til å bygge faktaark.naturbase.no-URL
```

Popup maks 320px bred, scrollbar y. Mobil: "Vis detaljer" → dialog.

Alle nye kolonner er nullable. Popup faller tilbake til dagens minimumsvisning hvis felter mangler.

## Åpent spørsmål

Skal "Søk dispensasjon"-knappen kun åpne ekstern lenke nå, eller vil du på sikt ha et internt søknadsskjema som forhåndsutfyller pilot/operatør/oppdrag? (Påvirker ikke denne runden — ekstern lenke uansett nå, men avgjør om jeg legger inn et hook-punkt.)
