
# Dynamiske statuskort med proporsjonale fargeseksjoner

## Oversikt
Statuskortene på dashbordet (Droner, Utstyr, Personell) redesignes slik at hver boks viser en visuell fordeling av grønn/gul/rød status med proporsjonale seksjoner. Klikk på en fargeseksjon åpner dialogen filtrert til kun elementer med den aktuelle statusen.

## Visuelt konsept

```text
Nåværende:
┌──────────────┐
│  Droner      │  (hele boksen én farge basert på "worst case")
│     5        │
│  ● 3  ● 1  ● 1 │
└──────────────┘

Nytt design:
┌──────────────────────────┐
│  Droner (5)              │
├────────┬──────┬──────────┤
│ GRØNN  │ GUL  │   RØD    │
│   3    │  1   │    1     │
│  60%   │ 20%  │   20%   │
└────────┴──────┴──────────┘
  (klikk på en seksjon = åpner dialog filtrert til den statusen)
```

Seksjonene er horisontalt fordelt proporsjonalt etter antall. Seksjoner med 0 elementer vises ikke.

## Tekniske endringer

### 1. StatusPanel.tsx - Redesign StatusCard
- Erstatte nåværende `StatusCard`-komponent med ny versjon som har proporsjonale fargeseksjoner
- Hver seksjon (grønn/gul/rød) får bredde basert på `flex-grow` med verdien lik antallet
- Kun seksjoner med count > 0 vises
- Hver seksjon er klikkbar med `onClick` som sender statusfilter til dialog-åpningen
- Tittel og ikon vises over den proporsjonale baren

### 2. StatusPanel.tsx - Statusfilter-state
- Legge til state for `statusFilter: Status | null` per dialog (drone/equipment/personnel)
- Når en fargeseksjon klikkes, settes filteret og riktig dialog åpnes
- Filteret sendes som ny prop `statusFilter` til dialogene

### 3. DroneListDialog.tsx - Filterstøtte
- Ny valgfri prop: `statusFilter?: Status | null`
- Filtrerer `drones`-arrayet basert på `statusFilter` før rendering
- Viser filteret i dialog-tittelen, f.eks. "Droner - Rød (1)"
- Mulighet for å fjerne filter inne i dialogen

### 4. EquipmentListDialog.tsx - Filterstøtte
- Samme mønster som DroneListDialog
- Ny prop `statusFilter?: Status | null`
- Filtrerer utstyrslisten tilsvarende

### 5. PersonnelListDialog.tsx - Filterstøtte
- Samme mønster
- Filtrerer basert på `calculatedStatus` som allerede beregnes

### Filer som endres:
- `src/components/dashboard/StatusPanel.tsx` - Hovedendringen med nytt design
- `src/components/dashboard/DroneListDialog.tsx` - Legge til filterlogikk
- `src/components/dashboard/EquipmentListDialog.tsx` - Legge til filterlogikk
- `src/components/dashboard/PersonnelListDialog.tsx` - Legge til filterlogikk
