# ECCAIRS Status UI Integration on /hendelser

## Overview
Add ECCAIRS export status display to incident cards on the Hendelser page. This will show export status, E2 ID, last attempt timestamp, and any errors for each incident.

## Database Structure (Already Created)
- `eccairs_exports` table with fields: `status`, `e2_id`, `last_attempt_at`, `last_error`, `incident_id`, `environment`
- `eccairs_integrations` table for company-level configuration

## Implementation Steps

### Step 1: Create TypeScript Type for EccairsExport
**File:** `src/pages/Hendelser.tsx`

Add type definition:
```typescript
type EccairsExport = {
  id: string;
  incident_id: string;
  status: string;
  e2_id: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
  environment: string;
  attempts: number;
};
```

### Step 2: Add State for ECCAIRS Exports
**File:** `src/pages/Hendelser.tsx`

Add new state:
```typescript
const [eccairsExports, setEccairsExports] = useState<Record<string, EccairsExport>>({});
```

### Step 3: Fetch ECCAIRS Exports Data
**File:** `src/pages/Hendelser.tsx`

Add useEffect to fetch eccairs_exports when incidents change:
```typescript
useEffect(() => {
  const fetchEccairsExports = async () => {
    if (incidents.length === 0) return;
    
    try {
      const { data, error } = await supabase
        .from('eccairs_exports')
        .select('*')
        .in('incident_id', incidents.map(i => i.id));

      if (error) throw error;

      const exportsMap: Record<string, EccairsExport> = {};
      data?.forEach(exp => {
        exportsMap[exp.incident_id] = exp;
      });
      setEccairsExports(exportsMap);
    } catch (error) {
      console.error('Error fetching ECCAIRS exports:', error);
    }
  };

  fetchEccairsExports();
}, [incidents]);
```

### Step 4: Add Real-time Subscription for ECCAIRS Exports
**File:** `src/pages/Hendelser.tsx`

Subscribe to changes in eccairs_exports table:
```typescript
useEffect(() => {
  const channel = supabase
    .channel('eccairs-exports-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'eccairs_exports'
      },
      (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const exportData = payload.new as EccairsExport;
          setEccairsExports(prev => ({
            ...prev,
            [exportData.incident_id]: exportData
          }));
        } else if (payload.eventType === 'DELETE') {
          const deleted = payload.old as { incident_id: string };
          setEccairsExports(prev => {
            const updated = { ...prev };
            delete updated[deleted.incident_id];
            return updated;
          });
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);
```

### Step 5: Add ECCAIRS Status UI Component
**File:** `src/pages/Hendelser.tsx`

Create a helper component or inline JSX for ECCAIRS status display in incident cards. Add after the "Linked mission" section (around line 499):

```tsx
{/* ECCAIRS Export Status */}
<div className="pt-3 border-t border-border/50">
  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
    ECCAIRS Rapportering
  </p>
  <div className="grid grid-cols-2 gap-2 text-sm">
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">Status:</span>
      <Badge variant="outline" className={getEccairsStatusColor(eccairsExports[incident.id]?.status)}>
        {getEccairsStatusLabel(eccairsExports[incident.id]?.status)}
      </Badge>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">E2 ID:</span>
      <span>{eccairsExports[incident.id]?.e2_id || '-'}</span>
    </div>
    {eccairsExports[incident.id]?.last_attempt_at && (
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Sist forsok:</span>
        <span>
          {format(new Date(eccairsExports[incident.id].last_attempt_at!), "d. MMM HH:mm", { locale: nb })}
        </span>
      </div>
    )}
    {eccairsExports[incident.id]?.last_error && (
      <div className="col-span-2 flex items-start gap-2 text-red-600 dark:text-red-400">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span className="text-xs">{eccairsExports[incident.id].last_error}</span>
      </div>
    )}
  </div>
</div>
```

### Step 6: Add Helper Functions for Status Styling
**File:** `src/pages/Hendelser.tsx`

Add helper functions:
```typescript
const getEccairsStatusLabel = (status: string | undefined): string => {
  switch (status) {
    case 'pending': return 'Venter';
    case 'draft_created': return 'Utkast opprettet';
    case 'submitted': return 'Sendt';
    case 'failed': return 'Feilet';
    default: return 'Ikke eksportert';
  }
};

const getEccairsStatusColor = (status: string | undefined): string => {
  switch (status) {
    case 'pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'draft_created': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'submitted': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'failed': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-300';
  }
};
```

### Step 7: Add Import for AlertTriangle (if not present)
**File:** `src/pages/Hendelser.tsx`

Verify `AlertTriangle` is imported from lucide-react (it may already be there or needs to be added).

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Hendelser.tsx` | Add EccairsExport type, state, fetch logic, real-time subscription, UI section, and helper functions |

## UI Design
- Displayed in a dedicated "ECCAIRS Rapportering" section on each incident card
- Grid layout with 2 columns for compact display
- Status shown as colored badge
- Error messages shown in red with AlertTriangle icon
- Timestamps formatted in Norwegian locale

## Optional Enhancements (Future)
- Add "Eksporter til ECCAIRS" button per incident
- Show environment (sandbox/prod) indicator
- Show attempt count for failed exports
- Add collapsible section for ECCAIRS details to reduce visual clutter
