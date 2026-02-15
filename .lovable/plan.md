
# Vertikal stabling av statuskort og mindre hendelser-seksjon

## Oversikt
Statuskortene (Droner, Utstyr, Personell) endres fra horisontal 3-kolonne layout til vertikal stabling - ett kort per rad. Hendelser-seksjonen gjores litt mindre for a gi plass.

## Endringer

### 1. StatusPanel.tsx - Vertikal layout
- Endre grid fra `grid-cols-1 sm:grid-cols-3` til `grid-cols-1` (alltid vertikal stabling)
- Hver StatusCard vises som en full-bredde rad med proporsjonale fargesegmenter side om side
- Beholde eksisterende stil med 20% opacity bakgrunn og 2px border

### 2. Index.tsx - Juster kolonnebredder
- Endre statuspanelet fra `lg:col-span-3` til `lg:col-span-3` (beholde)
- Endre hendelser-seksjonen fra `lg:col-span-3` til `lg:col-span-2` i hovedraden
- Justere senterkolonnen fra `lg:col-span-6` til `lg:col-span-7` for a bruke den frigjorte plassen

### Filer som endres:
- `src/components/dashboard/StatusPanel.tsx` - Grid til vertikal stabling
- `src/pages/Index.tsx` - Kolonnejustering for hendelser
