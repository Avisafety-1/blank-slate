# ECCAIRS Status UI Integration on /hendelser

## Overview
Add ECCAIRS export status display to incident cards on the Hendelser page. This will show export status, E2 ID, last attempt timestamp, attempt count, and any error messages for each incident. Data is fetched from the `eccairs_exports` table and updates in real-time.

## Prerequisites
- Table `eccairs_exports` exists (with RLS, indexes, constraints, updated_at trigger)
- `incidents` are already loaded in the component
- Supabase client is available
- Shadcn/ui is used (Badge, cn)
- date-fns is used with Norwegian locale

## Implementation Steps

### Step 1: Add Constants and Types (Lines 47-62 area)

Add after the existing `statusColors` definition:

```typescript
const ECCAIRS_ENV: 'sandbox' | 'prod' = 'sandbox';

type EccairsExportStatus = 'pending' | 'draft_created' | 'submitted' | 'failed';

type EccairsExport = {
  id: string;
  incident_id: string;
  status: EccairsExportStatus;
  e2_id: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
  environment: 'sandbox' | 'prod';
  attempts: number;
};
```

### Step 2: Add State (After line 82)

Add new state for ECCAIRS exports:

```typescript
const [eccairsExports, setEccairsExports] = useState<Record<string, EccairsExport>>({});
```

### Step 3: Add ECCAIRS Exports Fetch Hook (After line 171)

Add useEffect to fetch eccairs_exports when incidents change:

```typescript
// Fetch ECCAIRS exports when incidents change
useEffect(() => {
  const fetchEccairsExports = async () => {
    if (!incidents || incidents.length === 0) {
      setEccairsExports({});
      return;
    }

    try {
      const incidentIds = incidents.map(i => i.id);

      const { data, error } = await supabase
        .from('eccairs_exports')
        .select('*')
        .eq('environment', ECCAIRS_ENV)
        .in('incident_id', incidentIds);

      if (error) throw error;

      const exportsMap: Record<string, EccairsExport> = {};
      (data || []).forEach(exp => {
        exportsMap[exp.incident_id] = exp as EccairsExport;
      });

      setEccairsExports(exportsMap);
    } catch (err) {
      console.error('Error fetching ECCAIRS exports:', err);
    }
  };

  fetchEccairsExports();
}, [incidents]);
```

### Step 4: Add Real-time Subscription (After the new fetch hook)

Add real-time subscription for eccairs_exports changes:

```typescript
// Real-time subscription for ECCAIRS exports
useEffect(() => {
  const channel = supabase
    .channel(`eccairs-exports-${ECCAIRS_ENV}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'eccairs_exports',
        filter: `environment=eq.${ECCAIRS_ENV}`,
      },
      (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const exportData = payload.new as unknown as EccairsExport;
          setEccairsExports(prev => ({
            ...prev,
            [exportData.incident_id]: exportData,
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

### Step 5: Add Helper Functions (Before the return statement, around line 314)

Add helper functions for status labels and styling:

```typescript
const getEccairsStatusLabel = (status?: string): string => {
  switch (status) {
    case 'pending': return 'Venter';
    case 'draft_created': return 'Utkast opprettet';
    case 'submitted': return 'Sendt';
    case 'failed': return 'Feilet';
    default: return 'Ikke eksportert';
  }
};

const getEccairsStatusClass = (status?: string): string => {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'draft_created':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'submitted':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-300';
  }
};
```

### Step 6: Add ECCAIRS UI Block in Incident Card (After line 499, before Comments section)

Insert the ECCAIRS status UI section after the "Linked mission" section:

```tsx
{/* ECCAIRS Export Status */}
<div className="pt-3 border-t border-border/50">
  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
    ECCAIRS Rapportering
  </p>
  {(() => {
    const exp = eccairsExports[incident.id];
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Status:</span>
          <Badge variant="outline" className={cn(getEccairsStatusClass(exp?.status))}>
            {getEccairsStatusLabel(exp?.status)}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">E2 ID:</span>
          <span>{exp?.e2_id || '-'}</span>
        </div>
        {exp?.last_attempt_at && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Sist forsok:</span>
            <span>
              {format(new Date(exp.last_attempt_at), 'd. MMM HH:mm', { locale: nb })}
            </span>
          </div>
        )}
        {typeof exp?.attempts === 'number' && exp.attempts > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Forsok:</span>
            <span>{exp.attempts}</span>
          </div>
        )}
        {exp?.last_error && (
          <div className="col-span-2 flex items-start gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="text-xs">{exp.last_error}</span>
          </div>
        )}
      </div>
    );
  })()}
</div>
```

### Step 7: Update Imports (Line 11)

Add `AlertTriangle` to the existing lucide-react import and add `cn` import:

```typescript
import { Plus, Search, MessageSquare, MapPin, Calendar, User, Bell, Edit, FileText, Link2, ChevronDown, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
```

## Summary of Changes

| Location | Change |
|----------|--------|
| Lines 62-75 | Add `ECCAIRS_ENV` constant and `EccairsExport` type |
| Line 83 | Add `eccairsExports` state |
| After line 171 | Add fetch useEffect for ECCAIRS exports |
| After fetch hook | Add real-time subscription for ECCAIRS exports |
| Before line 314 | Add helper functions `getEccairsStatusLabel` and `getEccairsStatusClass` |
| After line 499 | Add ECCAIRS UI section in incident card |
| Line 11 | Add `AlertTriangle` to imports and add `cn` import |

## Critical Files for Implementation

- `src/pages/Hendelser.tsx` - Main file to modify with all ECCAIRS UI logic

## Result

- ECCAIRS status is displayed on every incident card
- Correct environment filtering (sandbox/prod)
- Real-time updates via Supabase subscription
- Ready for next step: "Eksporter til ECCAIRS" button
