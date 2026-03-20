

## Problem

The current approval notification logic (lines 184-198 in `send-notification-email`) is too broad:

1. It adds the parent company ID to `relevantCompanyIds`
2. Approvers with `approval_company_ids = null` are included if their `company_id` is in `relevantCompanyIds` — this means **all** parent company approvers get notified for child company missions, even without "all" scope
3. Approvers with `approval_company_ids = ['all']` from **any** company get notified

### Correct behavior (per your request)

- Only approvers **in the same company** as the mission should be notified (when `approval_company_ids` is null or includes the mission's `company_id`)
- Parent company approvers should **only** be notified if they have `approval_company_ids = ['all']`
- Email notification preference (`email_mission_approval`) must still be respected

## Plan

### 1. Fix filter logic in `send-notification-email/index.ts` (lines 184-198)

Remove the `relevantCompanyIds` array that includes the parent. Replace the filter with:

```
approvers = approverProfiles.filter(a => {
  if (a.approval_company_ids?.includes('all')) {
    // Parent or same-company approvers with "all" scope
    // Only allow if they're in the same company OR in the parent company
    const parentId = approvalCompany?.parent_company_id;
    return a.company_id === companyId || (parentId && a.company_id === parentId);
  }
  if (a.approval_company_ids) {
    // Explicit list — must include the mission's company
    return a.approval_company_ids.includes(companyId);
  }
  // No scope set (null) — only same company
  return a.company_id === companyId;
});
```

### File to modify
- `supabase/functions/send-notification-email/index.ts` — tighten approver filter logic

