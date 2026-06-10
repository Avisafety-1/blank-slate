# Fix: kryptisk HTML-tekst i 3D-popups for CAA-soner (Fengsel, Ambassade, m.fl.)

## Problem

Popupen for f.eks. Trondheim fengsel viser rå HTML midt i teksten:

```
…fengselet.Sikkerhetsnivå: Lavere sikkerhet. <a href='https://www.kriminalomsorgen.no/...'>Mer info</a>
```

Årsak: `caa_drone_zones.message`-feltet inneholder ferdig HTML (lenker o.l.) fra dronesoner.no-synken, men `buildCaaZonePopupHtml` i `src/lib/zonePopups.ts` kjører hele `message` gjennom `escapePopupHtml`, så `<a>`-taggen vises som tekst. Samme builder brukes både av 2D (Leaflet) og 3D (MapLibre), så feilen gjelder begge — bare mer synlig i 3D der popupene er større.

I tillegg mangler det et linjeskift før `Sikkerhetsnivå:` (kildedata har ofte `\n` som blir flatet ut).

## Endring

Kun `src/lib/zonePopups.ts` endres. Ingen endringer i datasynk, Map3D-cleanup, ruteplanlegging eller SORA.

### 1. Trygg HTML-rendering av `message`

Legg til en intern `sanitizeCaaMessageHtml(raw)` som:

- Escaper alt som default (`escapePopupHtml`).
- Tillater kun en hvitliste av enkle tagger som faktisk forekommer i CAA-meldinger: `<a href="…" target="_blank" rel="noopener noreferrer">`, `<br>`, `<br/>`, `<strong>`, `<em>`, `<b>`, `<i>`, `<p>`.
- For `<a>`: kun `href` som starter med `https://`, `http://`, `mailto:` eller `tel:` slippes gjennom. Tving `target="_blank" rel="noopener noreferrer"`. Alle andre attributter fjernes (ingen `onclick`, `style`, `javascript:` osv.).
- Konverter rå `\n` til `<br/>` slik at "Sikkerhetsnivå:" havner på egen linje.

Implementasjon uten ny avhengighet (DOMPurify er ikke i prosjektet): først full escape, deretter en kontrollert regex-pass som re-introduserer kun de hvitlistede taggene fra original-strengen via en token-basert tilnærming (replace `<a …>…</a>`, `<br/?>`, `<strong>…</strong>` osv. med plassholdere før escape, og bytt tilbake til validert HTML etterpå). Plassholderne bruker tegn som ikke kan oppstå i meldinger (f.eks. `\u0000TAG{n}\u0000`). Hver lenke valideres: parse `href`, sjekk protokoll, escape attributtverdien, escape lenketeksten.

### 2. Bruk i builder

I `buildCaaZonePopupHtml`, bytt:

```ts
html += `<div style="margin-top:4px;max-width:280px">${esc(p.message)}</div>`;
```

til:

```ts
html += `<div style="margin-top:4px;max-width:280px;word-break:break-word">${sanitizeCaaMessageHtml(p.message)}</div>`;
```

`word-break:break-word` hindrer at lange URL-er sprenger popupbredden (slik som i skjermbildet).

### 3. Eksport

Eksporter `sanitizeCaaMessageHtml` slik at `buildCaaSmallAirportPopupHtml` og `buildDkZonePopupHtml` kan ta den i bruk senere hvis behov, men ingen call-sites endres nå utenom CAA-builderen.

## Sikkerhet

- Standard er fortsatt full escaping.
- Bare hvitlistede tagger og protokoller slippes gjennom.
- Ingen `style`/`on*`/`javascript:` aksepteres.
- Lenketekst og `href` escapes etter validering før de settes inn.

## Verifisering

- 3D-kart: åpne popup på Trondheim fengsel og en annen fengsel-/ambassade-sone — lenken "Mer info" skal være klikkbar, ikke vises som rå HTML, og åpne i ny fane.
- 2D-kart: samme popup ser likt ut (samme builder).
- En melding med f.eks. `<script>alert(1)</script>` (defensiv test via lokal mock) skal vises som ren tekst, ikke kjøres.
- Lange URL-er bryter inne i popupen.

## Filer

- `src/lib/zonePopups.ts` (endret)

Ingen DB-migrasjoner. Ingen endringer i Map3D, ruteplanlegging, SORA eller datasynk.
