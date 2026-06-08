Plan:

1. Fiks MapLibre-feilen som stopper lagoppsett
   - `aip-extrusion` bruker nå et datauttrykk for `fill-extrusion-opacity`, som MapLibre ikke støtter for extrusion-opacity.
   - Endre dette til en fast opacity-verdi, slik at resten av `load/idle`-flyten ikke bryter før SafeSky-laget får rendret.

2. Gjør SafeSky-dronene synlige selv om GLTF-modellen laster tregt eller feiler
   - Behold Matrice 3D-modellen for alle droner.
   - Legg inn en tydelig fallback i samme SafeSky-kilde: små, synlige punkter/markører under 3D-modellen, ikke nesten usynlig `circle-opacity: 0.001`.
   - Når 3D-modellen er lastet, vises Matrice-modellene; fallback-markøren sikrer at trafikk aldri blir “usynlig”.

3. Forbedre 3D-modellaget
   - Normaliser Matrice-modellen rundt eget senter før cloning, så den ikke havner forskjøvet langt fra koordinatet.
   - Bruk en minimumshøyde over bakken for lave/0-altitude beacons, slik at droner ikke skjules i terreng eller bygninger.
   - Legg inn korte debug-logger for antall beacons og modell-load-status, så vi kan se om data, lag eller modell er problemet.

4. Valider etter endring
   - Sjekk konsollen for at `aip-extrusion`-feilen er borte.
   - Sjekk at SafeSky henter beacons og at minst fallback-markørene vises i 3D-kartet, med Matrice-modeller når modellen er lastet.