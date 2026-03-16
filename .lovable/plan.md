

## Problem: Edge function not sending approval emails from departments

### Root Cause
The edge function logs show only boot/shutdown with zero processing output — no console logs from the approval path. This indicates the **deployed version of `send-notification-email` does not contain the latest hierarchy-aware code**. The file was edited but likely not redeployed after the last changes.

### Database verification
- `support@avisafe.no` has `email_mission_approval = true` ✓
- `approval_company_ids = ['all']` ✓
- `can_approve_missions = true` ✓
- Role = `administrator` ✓

All settings are correct. The function logic in the code file is also correct — it looks up `parent_company_id`, includes parent approvers, and checks `['all']` scope.

### Fix

1. **Add console.log statements** to the `notify_mission_approval` block in `send-notification-email/index.ts` for debugging visibility (e.g., log companyId received, number of approvers found, notification prefs count)

2. **Redeploy the edge function** — this is the critical step. The current deployed version doesn't have the hierarchy-aware approval logic.

### Changes

| File | Change |
|------|--------|
| `supabase/functions/send-notification-email/index.ts` | Add console.log at entry of `notify_mission_approval` block: log `companyId`, approver count, parent lookup result |
| Deploy | Redeploy `send-notification-email` edge function |

