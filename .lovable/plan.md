## To fixer

### 1. Dialogen scroller ikke (mobil)
`FlightAnalysisDialog` har `max-h-[95vh] flex flex-col`, men kun timeline-blokken har `overflow-y-auto`. Sammendrags-panelet + kart + STD-widget tar all høyden på mobil og blir kuttet uten scrollbar.

**Fix i `src/components/dashboard/FlightAnalysisDialog.tsx`:**
- Pakk alt under `DialogHeader` (summary panel, map, timeline) i én felles `<div className="flex-1 min-h-0 overflow-y-auto -mx-3 px-3 sm:-mx-4 sm:px-4 space-y-3">`.
- Fjern `flex-1 min-h-0 overflow-y-auto` fra den indre timeline-wrapperen (linje 505), siden hele området nå scroller.

### 2. Pakk alle hendelser i én ekspanderbar meny
Bruker ønsker at hele "Hendelser under flyging"-seksjonen skjules bak en collapse-knapp (særlig for ArduPilot der lista blir lang).

**Fix i `src/components/dashboard/FlightSummaryPanel.tsx` (linje 147–185):**
- Bytt ut den ytre `<div>` rundt hovedlista med `<Collapsible defaultOpen={false}>`.
- Trigger viser totalantall: `Hendelser under flyging ({mainEvents.reduce((s, g) => s + g.count, 0) + appWarningEvents.reduce((s, g) => s + g.count, 0)})` + chevron.
- `CollapsibleContent` inneholder dagens innhold: `mainEvents.map(...)` + den eksisterende APP_WARNING-nested `<Collapsible>`.
- Default closed på alle plattformer (samme oppførsel mobil/desktop).
