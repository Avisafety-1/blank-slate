

## Problem

When returning to the app after backgrounding (switching tabs/apps), the map layers (OpenAIP tiles, SafeSky, data layers) don't render. The user has to log out and back in to fix it.

**Root cause**: There is no `visibilitychange` handler in `OpenAIPMap.tsx`. When the browser backgrounds the tab:
1. Leaflet's tile container can get into a stale rendering state -- needs `map.invalidateSize()` on return
2. SafeSky polling intervals get throttled/paused by the browser -- they may silently stop
3. The Supabase Realtime channel (`kart-main`) can disconnect silently during background
4. No mechanism exists to re-trigger data fetches when the tab becomes visible again

## Plan

### Changes to `src/components/OpenAIPMap.tsx`

Add a `visibilitychange` event listener inside the main map init `useEffect` that fires when the user returns to the tab:

1. **`map.invalidateSize()`** -- forces Leaflet to recalculate container size and re-render tiles
2. **Re-send heartbeat** -- ensures the backend knows someone is viewing (heartbeats may have expired while backgrounded)
3. **Restart SafeSky** -- call `safeSkyManager.stop()` then `safeSkyManager.start()` to re-trigger the warm-up and fresh data fetch
4. **Re-fetch key data layers** -- call `fetchAndDisplayMissions`, `fetchDroneTelemetry`, `fetchActiveAdvisories`, `fetchPilotPositions` again
5. **Re-subscribe Realtime channel** if disconnected -- check channel state and resubscribe if needed

The handler should be debounced (e.g., only act if the tab was hidden for > 5 seconds) to avoid unnecessary work on quick tab switches.

```text
document