

## Juster bunnlinje for dashboard-widgets (PC-visning)

### Problem
I PC-visningen (lg breakpoint) har de tre kolonnene i "Main Row" ulik høyde. Kalender-widgeten i venstre kolonne stopper høyere opp enn oppdrag (midten) og hendelser/KPI (høyre), noe som gir en ujevn bunnlinje.

### Løsning
Sørge for at alle tre kolonnene strekkes til samme høyde (grid default), og at den siste widgeten i venstre kolonne (kalender) bruker `flex-1` til å fylle gjenværende plass nedover. Dette gir en jevn bunnlinje på tvers av alle tre kolonnene.

### Tekniske endringer

**Fil: `src/pages/Index.tsx`**

1. Legg til `lg:items-stretch` på hovedrad-gridet (linje 428) for å sikre at alle kolonner har lik høyde.
2. Gi kalender-widgetens `DraggableSection` klassen `flex-1` slik at den strekker seg ned og fyller plassen.
3. Sikre at `CalendarWidget`-komponenten støtter å fylle tilgjengelig høyde (via `h-full` / `flex-1` på ytre container).

**Fil: `src/components/dashboard/CalendarWidget.tsx`**

4. Sjekke og eventuelt oppdatere ytterste container til å bruke `h-full flex flex-col` slik at widgeten fyller den tilgjengelige plassen fra `flex-1` på wrapperen.

