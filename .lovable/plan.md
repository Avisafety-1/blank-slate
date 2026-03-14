

## Problem

New companies created via registration get `dji_flightlog_enabled = false` (column default). The superadmin must manually toggle it on per company in the admin panel, which also triggers an API call to generate a DroneLog API key.

## Approach

Two changes needed:

### 1. Database: Set `dji_flightlog_enabled = true` in the registration trigger

Update `handle_new_user()` to explicitly insert the company with `dji_flightlog_enabled = true`.

### 2. Edge function: Auto-generate DroneLog API key after company creation

The trigger cannot call external APIs, so we need to generate the key from the client side after registration completes. When the Auth flow detects a newly created company (via `PENDING_NEW_COMPANY_KEY` in localStorage), call `manage-dronelog-key` with `enable: true` right after the company is created.

However, `manage-dronelog-key` requires superadmin role — so we have two options:

**Option A (simpler):** Create a new edge function `auto-provision-dronelog-key` that runs with service role and is triggered by the registration flow. It checks if the company was just created and has no key yet, then provisions one.

**Option B (simplest):** Just set the flag in the trigger. The API key gets generated lazily — either when the user first tries to upload a DJI log, or by having the existing `manage-dronelog-key` function also accept a `self-provision` mode where an administrator can provision their own company's key.

### Recommended: Option B with auto-provision

| Step | File | Change |
|------|------|--------|
| 1 | Migration SQL | Update `handle_new_user()` to pass `dji_flightlog_enabled => true` in the company INSERT |
| 2 | `manage-dronelog-key/index.ts` | Add a `selfProvision` mode: if caller is an administrator of the company, allow key creation without superadmin |
| 3 | `src/contexts/AuthContext.tsx` | After `fetchUserInfo` detects `djiFlightlogEnabled = true` but company has no key, auto-call the provisioning function |

This keeps the existing architecture clean while ensuring every new company gets DJI enabled with a working API key automatically.

