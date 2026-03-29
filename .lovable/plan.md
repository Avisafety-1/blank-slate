

## Fix N+1 API Call: `useCompanySettings` repeated queries

### Problem
Sentry reports 5 repeating identical queries to `companies?id=*&select=*` on the `/` route. The `useCompanySettings` hook is called by multiple components (MissionsSection, MissionDetailDialog, AddMissionDialog, IncidentsSection, MissionCard, etc.) that mount simultaneously. Despite the 30s in-memory cache, on initial load the cache is empty and all hooks fire their queries before the first one resolves -- causing N+1 duplicate requests.

### Solution
Deduplicate in-flight requests by storing the active Promise. When multiple callers request the same `companyId` concurrently, they share the same Promise instead of each firing a separate query.

Additionally, narrow `select("*")` to only the 5 fields actually used.

### File: `src/hooks/useCompanySettings.ts`

1. Add an `inflight` map (`Record<string, Promise<CompanySettings>>`) alongside the existing `cache`
2. When the cache misses, check `inflight[companyId]` first -- if a promise exists, await it instead of creating a new query
3. If no inflight promise, create the query, store it in `inflight`, and on resolution populate the cache and delete the inflight entry
4. Change `select("*")` to `select("show_all_airspace_warnings, hide_reporter_identity, require_mission_approval, require_sora_on_missions, require_sora_steps")`

### Result
Regardless of how many components call `useCompanySettings()` simultaneously, only ONE Supabase query fires per `companyId`. This resolves the Sentry N+1 issue.

