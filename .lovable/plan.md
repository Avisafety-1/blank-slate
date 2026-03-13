

## Problem

Dataen bekrefter at `gard@avisafe.no` fortsatt har rollen `admin` (ikke `administrator`). Migrasjonen ble opprettet men ser ikke ut til å ha oppdatert denne raden.

Resultatet:
- **Header**: Viser tannhjulet fordi AuthContext godtar både `admin` og `administrator`
- **Admin-siden**: Kaller `has_role(user_id, 'administrator')` som returnerer `false` for brukere med `admin`-rolle -- viser "no access"
- **Rolle-dropdown**: Viser blank fordi `admin` ikke finnes i `availableRoles`-listen

## Plan

### 1. Oppdater data: Konverter `admin` → `administrator`
Bruk data-oppdateringsverktøyet (ikke migrasjon) for å kjøre:
```sql
UPDATE user_roles SET role = 'administrator' WHERE role = 'admin';
```

### 2. Oppdater `Admin.tsx` `checkAdminStatus` for å godta begge roller
Legg til en fallback-sjekk slik at admin-siden også godtar den gamle `admin`-rollen:
```typescript
// Sjekk begge roller
const [adminResult, legacyResult] = await Promise.all([
  supabase.rpc('has_role', { _user_id: user?.id, _role: 'administrator' }),
  supabase.rpc('has_role', { _user_id: user?.id, _role: 'admin' }),
]);
if (adminResult.data || legacyResult.data) { ... }
```

### 3. Filer som endres
- **Data-oppdatering**: `user_roles` tabellen
- **`src/pages/Admin.tsx`**: `checkAdminStatus`-funksjonen

