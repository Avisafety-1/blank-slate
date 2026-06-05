## Flytt "Flytt til annen avdeling"-knapp til redigeringsmenyen

### Bakgrunn
Knappen "Flytt til annen avdeling" ligger i dag i DroneDetailDialog-headeren (ved siden av "Loggbok"), synlig selv når brukeren ikke er i redigeringsmodus. Brukeren ønsker den flyttet inn i redigeringsmenyen, rett under seksjonen "Synlighet for avdelinger".

### Endringer

**Fil:** `src/components/resources/DroneDetailDialog.tsx`

1. **Fjern knappen fra header-området** (linje 906–915)
   - Fjern `Button` med tekst "Flytt til annen avdeling" fra `!isEditing`-blokken i `DialogHeader`.
   - Behold "Loggbok"-knappen alene.

2. **Legg til knappen i redigeringsmodus** (etter linje 2023)
   - Etter `DepartmentChecklist`-seksjonen (`isEditing && isAdmin && deptVis.hasDepartments`), legg til en ny seksjon:
   - Vis kun når `isAdmin && !isSharedFromParent && drone?.company_id`
   - Styling: `border-t border-border pt-3` med en `Button variant="outline"` som åpner `MoveDroneDialog`
   - Plassering: rett før `<DialogFooter>`

### Rettigheter
Samme betingelser beholdes:
- `isAdmin` (admin/superadmin)
- `!isSharedFromParent` (ikke delt fra mor-selskap)
- `drone?.company_id` (drone har tilhørighet)

### Verifisering
- Åpne dronekort → bekreft at "Flytt til annen avdeling" er borte fra header
- Klikk "Rediger" → bekreft at knappen vises under "Synlighet for avdelinger"
- Klikk knappen → bekreft at `MoveDroneDialog` åpnes som før