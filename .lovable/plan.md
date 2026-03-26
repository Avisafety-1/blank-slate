

## Fix: Naturvernområder på kartet

### Problem
Det nåværende laget bruker feil WMS-tjeneste og feil lag-ID:
- **Bruker**: `vern_restriksjonsomrader/MapServer/WMSServer` med `layers: "0"` (= "landingsforbud_forsvaret" — militære landingsforbud)
- **Bør bruke**: `vern/MapServer/WMSServer` med `layers: "naturvern_klasser_omrade"` (faktiske verneområder med fargekoding etter vernekategori)

Miljødirektoratets `vern`-tjeneste har følgende relevante lag:
- `naturvern_klasser_omrade` — verneområder fargekategorisert (nasjonalpark, naturreservat, landskapsvern osv.)
- `naturvern_grense` — grenselinjer
- `foreslatt_naturvern_omrade` — foreslåtte verneområder

### Plan

**Fil: `src/components/OpenAIPMap.tsx` (linje 399-403)**

Endre WMS-URL og lag-parameter:

```text
Før:
  URL:    kart.miljodirektoratet.no/arcgis/services/vern_restriksjonsomrader/MapServer/WMSServer
  layers: "0"

Etter:
  URL:    kart.miljodirektoratet.no/arcgis/services/vern/MapServer/WMSServer
  layers: "naturvern_klasser_omrade"
```

I tillegg legge til et separat lag for restriksjonsområder (landingsforbud/lavflyvingsforbud) som eget kartlag med passende navn, slik at brukerne kan se begge:

1. **Naturvernområder** (grønn, `vern` → `naturvern_klasser_omrade`) — viser nasjonalparker, naturreservater osv.
2. **Vern-restriksjoner (ferdsel/landing)** (rød/oransje, `vern_restriksjonsomrader` → `ferdselsforbud,landingsforbud,lavflyving_forbudt_under_300m`) — viser ferdsels- og landingsforbud som er direkte droneoperasjonsrelevante

Begge satt til `enabled: false` som standard (brukeren slår på ved behov), bortsett fra restriksjonslagene som er mest driftskritiske.

### Teknisk endring

Én fil endres: `src/components/OpenAIPMap.tsx`, linjene 399-403. Erstatter dagens enkelt-lag med to separate lag med korrekte WMS-URLer og lag-IDer.

