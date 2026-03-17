

## Problem

The notification badges on the Settings icon (PendingApprovalsBadge) and Profile icon (follow-up incidents + pending missions) load late because:

1. **ProfileDialog**: The badge count depends on `followUpIncidents` and `pendingApprovalMissions`, which are fetched inside `fetchUserData()` -- a massive sequential waterfall of 8+ queries (profile, company, role, competencies, incidents, approval check, pending missions, risk assessments, notification prefs). The badge data is buried at steps 5-7 and won't render until the entire chain completes.

2. **PendingApprovalsBadge**: Fetches child companies first, then pending profiles -- two sequential queries. Less problematic but still delayed by React mount order.

## Plan

### 1. ProfileDialog: Split badge counts into a separate fast effect

Extract the two badge-relevant queries (follow-up incidents count + pending approval missions count) into a dedicated `useEffect` that runs immediately on mount, independent of the heavy `fetchUserData()` waterfall.

**File: `src/components/ProfileDialog.tsx`**
- Add a new `useEffect` that fires on `[user]` and runs two parallel queries:
  - `incidents` where `oppfolgingsansvarlig_id = user.id` and `status != 'Lukket'` (just count/ids)
  - `profiles.can_approve_missions` check, then `missions` where `approval_status = 'pending_approval'`
- Set `followUpIncidents` and `pendingApprovalMissions` from these fast queries
- The existing `fetchUserData()` will still populate the full data when the dialog opens, overwriting these initial counts

### 2. PendingApprovalsBadge: Run query immediately without waiting for children

**File: `src/components/PendingApprovalsBadge.tsx`**
- Run both queries (child companies + pending profiles) in parallel using `Promise.all` instead of sequentially
- This cuts the badge load time roughly in half

| File | Change |
|------|--------|
| `src/components/ProfileDialog.tsx` | Add early parallel badge-count effect separate from heavy fetchUserData |
| `src/components/PendingApprovalsBadge.tsx` | Parallelize the two sequential queries |

