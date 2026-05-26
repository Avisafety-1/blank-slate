## Problem

Småflyplass-sirklene (5 km) på kartet kommer fra CAA-laget (`caa_drone_zones` / dronesoner.no), ikke fra vår AIP-ATZ. De rendres i `src/lib/mapDataFetchers.ts` (CAA-blokken rundt linje 1014–1044) på `rmzPane` (z-index 620), som er **under** CTR/TIZ. Resultat: klikker du på en småflyplass-sirkel som ligger inni en CTR, treffer klikket CTR-polygonet.

Forrige fix la ATZ-sonene fra AIP-tabellen på en ny `atzPane` (z=645) – men CAA-flyplassene gikk vi aldri innom.

## Endring

I `src/lib/mapDataFetchers.ts`, CAA-`flyplasser`+`type=fly`-grenen:

1. Bytt `pane: 'rmzPane'` → `pane: 'atzPane'` slik at sirkelen ligger over CTR/TIZ/RMZ og fanger klikk først (samme mønster som AIP-ATZ-fixen).
2. Registrer sirkelen med `attachHoverPromotion(circle, { paneName: 'atzPane', baseStyle: {...} })` slik at den oppfører seg likt som andre vektor-soner ved hover (tykkere strek, bringes til front i panen, og pane-z løftes midlertidig så klikk garantert treffer den minste/mest spesifikke sonen under markøren — akkurat samme «pointer-through»-mønster som NSM / RPAS-5km / AIP-soner bruker).
3. Fjern den nå overflødige `circle.on('add', () => circle.bringToFront())` siden hover-promotion håndterer front-rekkefølge dynamisk.

`atzPane` ble allerede opprettet i `OpenAIPMap.tsx` i forrige runde (z-index 645, interaktiv), så ingen pane-endring trengs.

## Hvorfor dette virker

- CTR/TIZ ligger på `rmzPane` (620). `atzPane` er 645. Leaflet bruker pane-z-index for å bestemme hvilken SVG-path som mottar pointer-events først – høyere pane vinner.
- Hover-promotion gir den ekstra forsikringen om at hvis flere soner overlapper i `atzPane` selv (lite sannsynlig, men f.eks. to nære småflyplasser), så vinner den med minst areal – samme oppførsel brukerne allerede er vant til andre steder på kartet.

## Filer som endres

- `src/lib/mapDataFetchers.ts` – kun CAA-flyplass-grenen (~5 linjer)
