## Problem

I `tour-styles.css` har `.driver-active-element`-regelen `background: hsl(var(--primary) / 0.15) !important`. Når det «highlightede» elementet er en hel Radix-dialog (f.eks. dronedetaljer, loggbok, registrer-utstyr), overstyrer dette dialogens `bg-background` og gjør hele dialogen 15 % gjennomsiktig blå. Resultatet er at underliggende ressurslister synes gjennom dialogen — det er den «rare visuelle effekten» brukeren ser. Den blå tinten er ment for små targets (knapper, kort, menyelementer) hvor en svak markering hjelper, men den ødelegger store overflater som dialoger.

I tillegg kan `outline-offset: 3px` skyve markeringen forbi dialog-rammen og lage en flytende kant utenfor dialogen som ser «av».

## Løsning

Skreddersy highlight-stilen avhengig av om target er en stor overflate (dialog/card) eller et lite element.

### Endringer i `src/components/guided-tour/tour-styles.css`

1. **Fjern bakgrunns-tint på dialoger og kort**:
   - Ny regel som overstyrer for `[role="dialog"].driver-active-element`, `[role="alertdialog"].driver-active-element`: nullstill `background` til `transparent` (slik at dialogens egen `bg-background` vinner).
   - Behold tinten kun på små elementer (knapper, kort, listeitem). I praksis: gjør dagens regel mindre aggressiv ved å droppe `!important` på `background`, og legg eksplisitt regel for dialog som gjenoppretter opaque bakgrunn.

2. **Justér outline for dialoger**:
   - `outline-offset: 0` på dialoger, så ringen ligger akkurat på dialog-kanten i stedet for å flyte 3 px utenfor.
   - Tynnere outline (2 px) på store overflater for et roligere uttrykk.

3. **Generell opprydding**:
   - Fjern den ubrukte `box-shadow: 0 0 0 9999px ... inset` (har 0 alpha → no-op men forvirrende).

### Resultat

- Dialoger forblir helt opake under tour — ingen bleed-through.
- Små elementer (knapper, kort, menyer) får fortsatt tydelig blå markering.
- Outline ligger pent inntil dialog-rammen.

## Spørsmål

Ingen — fortsetter rett på fiks når godkjent.
