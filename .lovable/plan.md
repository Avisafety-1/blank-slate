

## Vis «Avdelinger»-tabben for superadmin uansett selskapstype

### Problem
Betingelsen på linje 676 er nå `!isChildCompany && departmentsEnabled`. Problemet er todelt:
1. Hvis superadmin bytter til et selskap som **er** en underavdeling (har `parent_company_id`), settes `isChildCompany = true` og tabben skjules.
2. `departmentsEnabled` hentes fra det aktive selskapets `departments_enabled`-felt. Hvis dette feltet ikke er satt på det aktuelle selskapet (kun på morselskapet), returnerer det `false`.

### Løsning
For **superadmin** skal «Avdelinger»-tabben alltid vises når selskapet har avdelinger aktivert, uavhengig av om selskapet er en underavdeling.

Endre betingelsen fra:
```
!isChildCompany && departmentsEnabled
```
til:
```
(isSuperAdmin || (!isChildCompany && departmentsEnabled))
```

Eventuelt, hvis `departmentsEnabled` alltid bør sjekkes:
```
(isSuperAdmin ? departmentsEnabled || isChildCompany : !isChildCompany && departmentsEnabled)
```

### Anbefalt tilnærming
Den enkleste og mest robuste løsningen er å la superadmin **alltid** se tabben (de kan inspisere alle selskaper):

```tsx
{(isSuperAdmin || (!isChildCompany && departmentsEnabled)) && (
```

### Fil som endres
- `src/pages/Admin.tsx` — linje 676, én betingelsesendring

