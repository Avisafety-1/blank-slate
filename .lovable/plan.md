

## Plan: Cancel dashboard queries on navigation + defer initial load

### Problem

When a user logs in and immediately clicks /kart, the dashboard (Index) has already fired 10+ Supabase queries. These continue running even after unmount, saturating the connection pool and blocking the map's data fetchers.

The network logs confirm this: duplicate `incidents`, `missions`, `incident_comments`, `mission_equipment` queries fire simultaneously on the dashboard.

### Strategy (two-pronged)

#### 1. Defer dashboard queries with a short delay

Add a ~300ms delay before dashboard sections start fetching. If the user navigates away within that window (e.g., clicks /kart immediately), the queries never fire. This is the biggest win.

#### 2. Abort on unmount via AbortController

Create an `AbortController` in `Index.tsx`, pass its signal to heavy fetching sections. On unmount, call `abort()` to cancel any in-flight queries.

#### 3. Heartbeat backoff on errors

When `useAppHeartbeat` gets a timeout/error, skip 2 cycles before retrying.

### Implementation

| File | Change |
|------|--------|
| `src/pages/Index.tsx` | Create `AbortController` + `mountedRef`. Pass signal to sections. Add 300ms `setTimeout` before setting a `readyToFetch` flag. Abort on unmount. |
| `src/components/dashboard/DocumentSection.tsx` | Accept optional `abortSignal` prop, pass to `.select()` call via `{ signal }`. Skip fetch if signal already aborted. |
| `src/components/dashboard/IncidentsSection.tsx` | Same pattern as DocumentSection. |
| `src/components/dashboard/MissionsSection.tsx` | Same pattern as DocumentSection. |
| `src/components/dashboard/StatusPanel.tsx` | Same pattern as DocumentSection. |
| `src/hooks/useAppHeartbeat.ts` | Add error counter; skip 2 cycles after a failure before retrying. |

### Key detail: deferred render pattern

```text
// Index.tsx
const [readyToFetch, setReadyToFetch] = useState(false);
const controllerRef = useRef(new AbortController());

useEffect(() => {
  const timer = setTimeout(() => setReadyToFetch(true), 300);
  return () => {
    clearTimeout(timer);
    controllerRef.current.abort();
  };
}, []);

// Only render data sections when readyToFetch is true
{readyToFetch && <DocumentSection abortSignal={controllerRef.current.signal} />}
```

This ensures: if a user clicks /kart within 300ms of landing on the dashboard, zero dashboard queries fire. If they stay, everything loads normally with a barely perceptible delay.

