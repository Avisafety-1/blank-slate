

## Plan: Justere z-index for kartlag på /kart

### Ønsket rekkefølge (nederst → øverst)
1. AIP / RMZ / RPAS (bunn, uendret)
2. **NOTAM** (flyttes ned, under NSM)
3. **NSM** (flyttes opp, over NOTAM)
4. Obstacle / Airport / Route
5. **Mission pins** (over NSM)
6. Live flight
7. **SafeSky** (øverst)

### Endring
**`src/components/OpenAIPMap.tsx`** (linje 396–400) — oppdater `paneConfig` z-index:

| Pane | Før | Etter |
|---|---|---|
| safeskyPane | 698 | **750** (øverst) |
| liveFlightPane | 699 | 720 |
| missionPane | 685 | **680** *(over NSM, se under)* |
| airportPane | 690 | 670 |
| routePane | 680 | 665 |
| obstaclePane | 675 | 660 |
| **nsmPane** | 650 | **650** *(uendret som referanse)* |
| **notamPane** | 695 | **640** *(under NSM)* |
| rpasPane | 645 | 630 |
| aipPane | 640 | 625 |
| rmzPane | 635 | 620 |

Konkret resultat (lav → høy): `rmz(620) < aip(625) < rpas(630) < notam(640) < nsm(650) < obstacle(660) < route(665) < airport(670) < mission(680) < liveFlight(720) < safesky(750)`.

`powerPane` (692) og `naisPane` (655) holdes mellom obstacle og liveFlight — flyttes til 700/695 for konsistens.

### Filer som endres
- `src/components/OpenAIPMap.tsx` (kun `paneConfig`-objektet og de to senere `createPane`-blokkene for power/nais)

### Resultat
NOTAM-sirkler legger seg under NSM-flater, oppdragspinner vises tydelig oppå NSM-områdene, og SafeSky-trafikk forblir alltid øverst.

