
# Begrens godkjenning av nye brukere til kun administrator og superadmin

## Nåværende situasjon og problemet

Det er én gjenværende feil etter rolleforenklingen: **edge-funksjonen `send-notification-email`** bruker fortsatt en hardkodet SQL-spørring med de gamle rollene:

```javascript
// Linje 105 i send-notification-email/index.ts — FEIL (gammel rollenavn)
const { data: adminRoles } = await supabase
  .from('user_roles')
  .select('user_id')
  .in('role', ['admin', 'superadmin']);  // ← bruker gammel rolle 'admin'
```

Siden alle brukere med rollen `admin` er migrert til `administrator`, vil denne spørringen nå returnere **null** — ingen admins vil bli funnet, og dermed sendes det ingen e-postvarsling når nye brukere registrerer seg.

De andre delene er allerede riktige:
- `PendingApprovalsBadge` bruker `isAdmin` fra `AuthContext`, som allerede sjekker `administrator | superadmin`
- `ProfileDialog.tsx` viser `email_new_user_pending`-bryteren kun for admin (sjekker `administrator || superadmin`, linje 201)
- `Admin.tsx` er allerede beskyttet via `has_role(..., 'administrator')` i `checkAdminStatus()`
- `has_role()`-funksjonen har legacy-alias slik at RLS-policyer som bruker `'admin'::app_role` fortsatt fungerer

## Hva som endres

### 1. Edge-funksjon: `send-notification-email/index.ts`

Oppdaterer linje 105 til å hente brukere med enten `administrator` eller `superadmin`:

```javascript
// FØR:
.in('role', ['admin', 'superadmin'])

// ETTER:
.in('role', ['administrator', 'superadmin'])
```

Dette sikrer at alle med riktig rolle mottar e-postvarsling når nye brukere registrerer seg, og at ingen med den utdaterte `admin`-rollen (som ikke lenger brukes) feilaktig inkluderes.

### 2. Database RLS-policy: `profiles` — "Admins can approve users in own company"

Den eksisterende policyen bruker `has_role(auth.uid(), 'admin'::app_role)`, noe som allerede fungerer korrekt takket være legacy-aliaset i `has_role()`-funksjonen. Ingen endring nødvendig her.

## Hva som IKKE endres

- `PendingApprovalsBadge` — allerede korrekt (bruker `isAdmin` fra `AuthContext`)
- `ProfileDialog.tsx` — allerede korrekt (`isAdmin` settes til `administrator || superadmin`)
- `Admin.tsx` — allerede korrekt (bruker `has_role(..., 'administrator')`)
- RLS-policyer — allerede korrekt via legacy-alias i `has_role()`

## Fil som endres

| Fil | Endring |
|---|---|
| `supabase/functions/send-notification-email/index.ts` | Oppdater linje 105: `'admin'` → `'administrator'` i rolle-filteret |

Funksjonen vil automatisk re-deployes etter endringen.
