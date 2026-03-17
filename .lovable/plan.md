

## Problem

Når en bruker i en avdeling (Selskap B) prøver å sende et oppdrag til godkjenning, kjører `handleSubmitForApproval` en query mot `profiles`-tabellen med `.eq('can_approve_missions', true)`. RLS på `profiles` begrenser resultatene til brukerens synlige selskaper. En bruker i Selskap B ser **ikke** profiler fra morselskapet — dermed returneres ikke godkjenneren fra morselskapet, selv om vedkommende har `approval_company_ids: ['all']`.

Identisk problem ble løst for hendelsesansvarlige med `get_incident_responsible_users` (SECURITY DEFINER-funksjon som bypasser RLS).

## Løsning

Lag en tilsvarende SECURITY DEFINER-funksjon `get_mission_approvers` og bruk den i stedet for den direkte profil-queryen.

### 1. Ny databasefunksjon (migrasjon)

```sql
CREATE OR REPLACE FUNCTION get_mission_approvers(target_company_id uuid)
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Godkjennere i samme selskap
  SELECT p.id, p.full_name
  FROM profiles p
  WHERE p.approved = true
    AND p.can_approve_missions = true
    AND p.company_id = target_company_id

  UNION

  -- Godkjennere fra morselskapet med riktig scope
  SELECT p.id, p.full_name
  FROM profiles p
  JOIN companies c ON c.id = target_company_id
  WHERE p.approved = true
    AND p.can_approve_missions = true
    AND c.parent_company_id IS NOT NULL
    AND p.company_id = c.parent_company_id
    AND (
      p.approval_company_ids @> ARRAY['all']
      OR p.approval_company_ids @> ARRAY[target_company_id::text]
    )

  ORDER BY full_name ASC;
$$;
```

### 2. Oppdater `src/hooks/useOppdragData.ts`

Erstatt den nåværende logikken (linje 199-221) med et enkelt RPC-kall:

```typescript
const { data: approvers, error: approverError } = await supabase
  .rpc('get_mission_approvers', { target_company_id: companyId! });

if (approverError) throw approverError;

if (!approvers || approvers.length === 0) {
  toast.error('Ingen i selskapet har rollen som godkjenner...');
  return;
}
```

Dette fjerner den manuelle filtreringen og det ekstra company-oppslaget, og løser RLS-begrensningen.

### Filer som endres

| Fil | Endring |
|-----|---------|
| Ny migrasjon | `get_mission_approvers` SECURITY DEFINER-funksjon |
| `src/hooks/useOppdragData.ts` | Erstatt profil-query + filter med `rpc('get_mission_approvers')` |

