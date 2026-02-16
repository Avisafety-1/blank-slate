
## Begrense listehøyde på /ressurser

Listene for droner, utstyr og personell på ressurssiden viser i dag alle elementer uten noen høydebegrensning, noe som gjor at seksjonene kan bli veldig lange.

### Endring

Legge til en fast maksimalhøyde på listcontainerne (`div.space-y-3`) inne i hver av de tre GlassCard-seksjonene (Droner, Utstyr, Personell), slik at de viser ca. 5-6 elementer og resten kan nås ved scrolling.

### Teknisk detalj

I `src/pages/Resources.tsx` legges `max-h-[420px] overflow-y-auto` til pa de tre `<div className="space-y-3">` containerne som holder drone-, utstyr- og personell-kortene. 420px tilsvarer omtrent 5-6 kort med dagens kortstorrelse. Sokefeltet og overskriften forblir utenfor scroll-omradet slik at de alltid er synlige.

Filer som endres:
- `src/pages/Resources.tsx` (3 steder: drone-listen, utstyr-listen, personell-listen)
