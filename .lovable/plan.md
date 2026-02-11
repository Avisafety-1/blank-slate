

## Fix: Norwegian Characters (Æ Ø Å) in Email Templates

### Problem
The three recent email templates -- "Oppdrag godkjent" (mission_approved), "Send til godkjenning" (mission_approval_request), and "Kommentar til pilot" (pilot_comment_notification) -- are all missing `<meta charset="utf-8">` in their HTML `<head>` section. Without this, email clients may not correctly interpret Norwegian characters like Æ, Ø, and Å.

### Solution
Add `<meta charset="utf-8">` to the `<head>` of all three default templates in `template-utils.ts`, and ensure the inline fallback HTML in `send-notification-email/index.ts` also includes charset declarations.

### Changes

**File 1: `supabase/functions/_shared/template-utils.ts`**
- Add `<meta charset="utf-8">` inside `<head>` for:
  - `mission_approved` template (line ~420)
  - `mission_approval_request` template (line ~453)
  - `pilot_comment_notification` template (line ~492)

**File 2: `supabase/functions/send-notification-email/index.ts`**
- Update inline fallback HTML strings for all three handlers to include `<meta charset="utf-8">`:
  - `notify_mission_approval` fallback (line ~172)
  - `notify_pilot_comment` fallback (line ~218)
  - `notify_mission_approved` fallback (line ~284)

After changes, redeploy the `send-notification-email` edge function.
