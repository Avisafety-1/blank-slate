

## Fix: Opplæring-tabben vises for Norconsult

### Problem
Betingelsen på linje 1384 er `isSuperAdmin || departmentsEnabled`. Norconsult har `departments_enabled = true` (de er morselskap med avdelinger), så de får full tilgang til opplæring.

### Løsning
Endre betingelsen til kun `isSuperAdmin`. Da får bare AviSafe-superadmins tilgang til opplæringsinnholdet. Alle andre selskaper (inkludert Norconsult) ser "Side under utvikling".

### Endring

**`src/pages/Admin.tsx` linje 1384:**
```
// Fra:
{isSuperAdmin || departmentsEnabled ? (

// Til:
{isSuperAdmin ? (
```

En enkelt linje-endring.

