

## Plan: Skip full refresh on page reload when cache is fresh

### Problem

On every page refresh, `getSession()` resolves with an existing session and calls `refreshAuthState('initial-session')`, which runs 3+ database queries (profile, role, accessible companies) plus a background `getUser()` call. The auth logs show `/user` requests taking 2-17 seconds, sometimes timing out with 500/504.

Even though the cached profile is applied instantly for UI rendering, the full refresh still fires — blocking `authRefreshing` and potentially causing flickering or delayed interactivity.

### Root cause

There's no staleness check on the cached profile. Every page load runs a full refresh regardless of whether the user just