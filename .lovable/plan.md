

## Vis «Avdelinger»-tabben for superadmin

### Problem
Linje 676 i `src/pages/Admin.tsx` har betingelsen `!isSuperAdmin && !isChildCompany && departmentsEnabled`, som eksplisitt skjuler «Avdelinger»-tabben når en superadmin har byttet til et annet selskap.

### Løsning
Endre betingelsen fra:
```
!isSuperAdmin && !isChildCompany && departmentsEnabled
```
til:
```
!isChildCompany && departmentsEnabled
```

Dette gjør at tabben vises for alle administratorer (inkludert superadmin) når selskapet har avdelinger aktivert. Superadmin ser allerede «Selskaper»-tabben (global oversikt) i tillegg, så begge tabbene vil være synlige når superadmin er på et selskap med avdelinger.

### Fil som endres
- `src/pages/Admin.tsx` — én linje (676)

