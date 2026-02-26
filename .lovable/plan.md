

## Problem

The database trigger `create_default_email_settings` (migration `20251204091249`) hardcodes `smtp_pass = 'Avisafe!'` when creating email settings for a new company. This is the **wrong password**.

The `getEmailConfig` function in `email-config.ts` (line 110) reads `emailPass = emailSettings.smtp_pass`. Since `'Avisafe!'` is truthy, it does NOT fall through to the global secret fallback (line 117: `if (!emailPass)`). The SMTP connection then fails with the wrong password.

When you "cycle" the email settings in the UI, `handleSave` sends `p_smtp_pass: null` (line 167 of `EmailSettingsDialog.tsx`, because `useAviSafe` is true). This clears the password to null, triggering the fallback to the correct global `EMAIL_PASS` secret. That's why toggling fixes it.

## Fix

Update the trigger function to store `smtp_pass = NULL` instead of `'Avisafe!'`. This ensures the fallback to the global `EMAIL_PASS` secret works immediately for all new companies.

### Database migration

```sql
CREATE OR REPLACE FUNCTION public.create_default_email_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.email_settings (
    company_id, smtp_host, smtp_port, smtp_user, smtp_pass,
    smtp_secure, from_name, from_email, enabled
  ) VALUES (
    NEW.id,
    'send.one.com',
    465,
    'noreply@avisafe.no',
    NULL,          -- ← was 'Avisafe!' (wrong password); NULL triggers global secret fallback
    true,
    'AviSafe',
    'noreply@avisafe.no',
    true
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix any existing companies still stuck with the wrong hardcoded password
UPDATE public.email_settings
SET smtp_pass = NULL
WHERE smtp_pass = 'Avisafe!'
  AND smtp_host = 'send.one.com'
  AND smtp_user = 'noreply@avisafe.no';
```

One migration, no code changes needed.
