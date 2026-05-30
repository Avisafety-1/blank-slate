## Problem
Når en ventende logg har et langt navn (typisk ArduPilot, f.eks. "ArduCopter V3.6.12 (23a69308)"), strekker raden seg bredere enn kortet og hele dialogen får venstre/høyre scroll. På kontoer med kun DJI-logger oppstår ikke dette fordi navnene er kortere.

## Årsak
I `src/components/PendingDjiLogsSection.tsx` (linje 208) brukes `truncate` på dronenavnet, men flex-foreldren mangler `min-w-0`. Uten det vil `truncate` ikke kunne krympe teksten, og raden vokser i stedet for å kuttes med "…".

## Endringer

**1. `src/components/PendingDjiLogsSection.tsx`**
- Legg til `min-w-0` på den indre flex-raden (linje 208) som inneholder navn + badges.
- Sikre at `<p className="truncate">` også har `min-w-0` (via klassen `flex-1 min-w-0`) slik at lange ord/identifikatorer faktisk kuttes.

**2. `src/components/UploadDroneLogDialog.tsx`** (forsvar i dybden)
- Legg til `overflow-x-hidden` på `DialogContent` (linje 3154) slik at evt. andre fremtidige lange tekster ikke kan trigge horisontal scroll i dialogen.

## Effekt
- Lange ArduPilot-navn kuttes med "…" og raden holder seg innenfor kortet.
- Dialogen kan ikke scrolles horisontalt lenger.
- Ingen funksjonell endring — kun layout/CSS.
