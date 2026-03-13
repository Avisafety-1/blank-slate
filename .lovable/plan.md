

## Problem

Databasen inneholder to ulike rolleverdier som betyr det samme:
- **`admin`** — gammel enum-verdi, brukt av eldre brukere (f.eks. `gard@avisafe.no`)
- **`administrator`** — ny enum-verdi, brukt av nyere brukere

`AuthContext` sjekker kun `administrator` for admin-tilgang, så brukere med `admin`-rollen får:
- `isAdmin = false` → ingen tilgang til admin-panelet
- Blank rolle-dropdown i admin-panelet (fordi `admin` ikke er i `availableRoles`)
- Sletting feiler fordi edge-funksjonen ikke gjenkjenner rollen

Verifisert i databasen:
- `gard@avisafe.no` → rolle: **`admin`** ← gammel
- `kontakt@avisafe.no` → rolle: **`administrator`** ← ny

## Løsning

### 1. Database-migrasjon: Konverter alle `admin`-roller til `administrator`
```sql
UPDATE user_roles SET role = 'administrator' WHERE role = 'admin';
```
Dette fikser alle eksisterende brukere umiddelbart.

### 2. AuthContext: Legg til fallback for legacy `admin`
I `src/contexts/AuthContext.tsx`, utvid `isAdmin`-sjekken til å også godta `admin`:
```typescript
profileData.isAdmin = ['administrator', 'admin'].includes(roleResult.data.role) || roleResult.data.role === 'superadmin';
```
Dette sikrer bakoverkompatibilitet i tilfelle det finnes caching eller andre steder som bruker gammel verdi.

### 3. Admin-panelet: Legg til `admin` → `administrator`-mapping i `getRoleLabel`
Sørg for at hvis noen fortsatt har `admin`-rollen, vises den riktig i UI-et i stedet for å være blank.

### Filer som endres
- **Database-migrasjon** — `UPDATE user_roles SET role = 'administrator' WHERE role = 'admin'`
- **`src/contexts/AuthContext.tsx`** — utvid `isAdmin`-sjekken
- **`src/pages/Admin.tsx`** — legg til fallback i `getRoleLabel`

