## Problem

I 3D-modus blokkerer kube-knappen (2D/3D-toggle) zoom-knappene. Min forrige endring flyttet kun knappen i 2D-modus (via `stackSlotAboveLayers` i `OpenAIPMap`), men i 3D-modus rendres `Map3D` i stedet — der finnes ingen Kartlag-knapp, og kuben plasseres separat i `Kart.tsx` på `top-4 right-4`, akkurat der MapLibre sin NavigationControl (zoom + kompass) ligger. Derfor overlapper de.

## Knapp-stack i 3D-modus (`Map3D`)

```text
top-2     [ + ]   ← MapLibre zoom inn
          [ − ]   ← MapLibre zoom ut
          [ ◣ ]   ← MapLibre kompass
top-6.5rem [ ⛰ ]   ← Base-layer toggle (satellitt/topo/standard)
```

Kuben må plasseres som neste slot i denne kolonnen, slik:

```text
top-6.5rem [ ⛰ ]   ← Base-layer toggle
top-10rem  [ ⬛ ]   ← 2D/3D-toggle (kube)  ← NY POSISJON
```

## Endringer

1. **`src/components/Map3D.tsx`**
   - Legg til en valgfri prop `extraStackSlot?: React.ReactNode` på `Map3DProps`.
   - Render `{extraStackSlot}` rett under base-layer-knappen i den eksisterende vertikale stacken (`top-2 right-2` containeren utvides til en `flex flex-col gap-2`-wrapper rundt begge knappene), slik at de stacker pent uten manuelle `top-*`-offsets.

2. **`src/pages/Kart.tsx`**
   - Fjern den absoluttposisjonerte `<div className="absolute top-4 right-4 z-[1100]">{toggle3DBtn}</div>` i 3D-grenen.
   - Send i stedet `toggle3DBtn` videre som `extraStackSlot={toggle3DBtn}` til `<Map3D …/>`, slik at den havner i samme høyre-stack som base-layer-knappen — direkte under Kartlag/grunnkart-knappen og under MapLibre-zoom.

## Resultat

- Zoom +/−/kompass forblir helt klikkbare.
- Knappene stacker vertikalt i ett konsistent oppsett i både 2D og 3D.
- Ingen endring i forretningslogikk — kun layout/plassering.
