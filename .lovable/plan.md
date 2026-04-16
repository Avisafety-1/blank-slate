

## NOTAM Improvements: Clickable Badge, Email Submit, Date in Text, Badge Color

### Changes

**1. Database Migration** — Add `notam_submitted_at` (timestamptz, nullable) to `missions` to track when "Send inn" was clicked.

**2. NotamDialog.tsx**
- Add "Send inn" button next to "Lagre" that:
  - First saves the NOTAM (same as Lagre)
  - Sets `notam_submitted_at = now()` on the mission
  - Opens `mailto:hauggard@gmail.com` with subject `UAS Notam request, {companyName}` and body containing greeting + NOTAM text + user/company signature
  - Calls `onSaved` to refresh
- Include dates in the generated NOTAM text: when `scheduleType === "daily"` and dates are set, prepend the date range before the day/time line (e.g. `01.03.2026-05.03.2026 MON-FRI 0800-1600`)
- Fetch user's full name from AuthContext for the email signature

**3. MissionCard.tsx**
- Make the NOTAM badge clickable (calls `onNotam`)
- Badge color logic:
  - Yellow (`bg-amber-500/20 text-amber-900 border-amber-500/30`) when `notam_text` exists but `notam_submitted_at` is null
  - Green (`bg-green-500/20 text-green-900 border-green-500/30`) when `notam_submitted_at` is set

**4. MissionsSection.tsx** — Same badge color logic (yellow vs green).

### Files
| File | Action |
|------|--------|
| Migration | Add `notam_submitted_at timestamptz` |
| `src/components/dashboard/NotamDialog.tsx` | Add "Send inn" button, include dates in text, add `onSubmitted` |
| `src/components/oppdrag/MissionCard.tsx` | Clickable badge, yellow/green logic |
| `src/components/dashboard/MissionsSection.tsx` | Yellow/green badge logic |
| `src/integrations/supabase/types.ts` | Add `notam_submitted_at` field |

