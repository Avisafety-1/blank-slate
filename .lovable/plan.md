## Problem

Tre datakilder tegner overlappende 5 km-sirkler rundt flyplasser:

1. **`rpas_5km_zones`** (Avinor) — 50 store lufthavner (Gardermoen, Bergen, Notodden lufthavn ENNO …). Autoritativ, med full NINOX-prosedyre, telefon og kontaktinfo i popup.
2. **`caa_drone_zones`** layer `flyplasser` med `type=Fly` — 80 stk. Inkluderer **alle** de 50 Avinor-flyplassene **+** ~30 ikke-Avinor-plasser (Notodden sjøflyplass/Heddalsvatnet, Dagali, Kjeller, Frosta, Hokksund, Aukra …). Popup peker bare til myppr.no.
3. **OpenAIP `ATZ`** — tegnes også som 5 km sirkel med myppr.no-popup.

Resultat: For Notodden vises både Avinor-pin (ENNO) **og** en gul CAA-sirkel ("Notodden sjøflyplass"), pluss potensielt ATZ — flere overlappende sirkler/popups.

## Anbefaling

Vi kan **ikke** fjerne våre egne 5 km-soner helt — Avinor dekker bare 50 lufthavner, og småflyplasser/sjøflyplasser ville da forsvinne. I stedet dedupliserer vi slik at Avinor-data alltid vinner der den finnes.

## Tiltak (kun frontend-rendering i `src/lib/mapDataFetchers.ts`)

1. **Når `rpas_5km_zones` er lastet, bygg et sett av "claimed centers"** — sentroider for alle 50 Avinor-sonene (huskes som lat/lng i en modul-lokal cache).
2. **Filter i CAA-renderingen** (linje ~1033, `flyplasser` + `type=fly`):
   - Hvis sentroiden ligger innenfor **3 km** av en Avinor-sentroide → **ikke tegn sirkel**. Avinor-popupen er allerede der og er mer informativ.
   - Ellers (småflyplass/sjøflyplass uten Avinor-dekning) → tegn 5 km-sirkel som før.
3. **Samme filter for ATZ-rendering** (linje ~211 i samme fil): hopp over ATZ-soner som ligger innenfor 3 km av en Avinor-sentroide.
4. **Render-rekkefølge**: sørg for at `rpas_5km_zones` lastes/lagres i cache *før* CAA og ATZ, eller utfør dedupe ved hvert kall (re-evaluér ved layer toggle).

Ingen DB-endringer. Ingen endringer i sone-kategorier/regler — kun visuell dedupe.

## Bonus (valgfritt, samme PR)

Oppdater fallback-popupen i `src/lib/rpas5kmPopup.ts` (linjene 82–86) til å nevne myppr.no når data mangler, slik at brukeren får samme handlingsinfo som i CAA-popupen.

## Verifisering

- Notodden: Skal vise **én** sirkel/pin (Avinor ENNO). Den separate "Notodden sjøflyplass"-sirkelen skal forsvinne (sentroide < 3 km fra ENNO).
- Dagali / Kjeller / Frosta: skal fortsatt vises som gule 5 km-sirkler med myppr.no.
- Gardermoen, Sola, Værnes: kun Avinor-pin, ingen duplikat fra CAA.
