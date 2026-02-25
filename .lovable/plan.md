

# Fix: PWA tvinges til landskapsmodus på DJI RC Pro

## Problem

PWA-manifestet har `orientation: "portrait-primary"` (linje 30 i `vite.config.ts`). DJI RC Pro har en bred skjerm som naturlig er i landskapsmodus. Når manifestet tvinger `portrait-primary`, roteres appen 90 grader — som gjør at den vises feil vei.

## Løsning

Endre `orientation` til `"any"` slik at appen tilpasser seg skjermens naturlige orientering i stedet for å tvinge portrett.

## Fil som endres

| Fil | Endring |
|---|---|
| `vite.config.ts` | Endre `orientation: "portrait-primary"` → `orientation: "any"` |

1 linje endret.

## Merk

Etter deploy må brukeren slette cache/avinstallere PWA og reinstallere for at det nye manifestet skal tre i kraft, da service workeren cacher det forrige manifestet.

