

## Fix: Mobilbredde for "Rediger drone"-modus i DroneDetailDialog

Problemet er at redigeringsmodus (isEditing) bruker faste `grid-cols-2` og `grid-cols-3` uten responsive breakpoints. På 390px viewport blir to kolonner med input-felter for smale.

Endringen gjelder KUN edit-mode grids i DroneDetailDialog.tsx — visningsmodus (read-only) forblir uendret.

### Endringer i `src/components/resources/DroneDetailDialog.tsx`

**1. Rediger-grids (6 steder, ca. linje 1495-1688)**

Alle edit-mode `grid-cols-2 gap-4` endres til `grid-cols-1 sm:grid-cols-2 gap-4`:
- Modell / Serienummer (~linje 1495)
- Klasse / Kjøpsdato (~linje 1533)
- Vekt / Payload (~linje 1561)
- Flyvetimer / Status (~linje 1586)
- Inspeksjon datoer (~linje 1623, 1645, 1666)

**2. Varsel-grid (linje 1689)**

`grid-cols-3 gap-4` endres til `grid-cols-1 sm:grid-cols-3 gap-4`

Disse endringene gjør at feltene stables vertikalt på mobil og vises side-om-side på bredere skjermer, uten å endre visningsmodus eller annen funksjonalitet.

