import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
  fromName?: string;
  fromEmail: string;
}

// Sanitize subject line - remove control characters only
// Let denomailer/SMTP handle all encoding - do NOT pre-encode with RFC2047
// Pre-encoding causes double-encoding which results in malformed headers (==3d)
export function sanitizeSubject(subject: string): string {
  // Remove CR/LF to prevent header injection and folding issues
  return subject.replace(/[\r\n]/g, ' ').trim();
}

// @deprecated - Use sanitizeSubject instead. This function is kept for backward compatibility
// but should not be used as it causes double-encoding issues with denomailer
export function encodeSubject(subject: string): string {
  console.warn('encodeSubject is deprecated - use sanitizeSubject instead');
  return sanitizeSubject(subject);
}

// Format sender address as RFC 5322 compliant string
export function formatSenderAddress(fromName: string | undefined, fromEmail: string): string {
  const email = fromEmail.toLowerCase();
  
  if (!fromName) {
    return email;
  }
  
  // Check if name contains non-ASCII characters (æøå etc.)
  const hasNonAscii = /[^\x00-\x7F]/.test(fromName);
  
  if (hasNonAscii) {
    // Use RFC 2047 Base64 encoding for non-ASCII
    const encoder = new TextEncoder();
    const bytes = encoder.encode(fromName);
    const base64 = btoa(String.fromCharCode(...bytes));
    return `=?UTF-8?B?${base64}?= <${email}>`;
  }
  
  // Check if name contains RFC 5322 special characters that require quoting
  // These are: ( ) < > [ ] : ; @ \ , . "
  const hasSpecialChars = /[()<>\[\]:;@\\,."']/.test(fromName);
  
  if (hasSpecialChars) {
    // Escape any existing quotes and backslashes in the name
    const escapedName = fromName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escapedName}" <${email}>`;
  }
  
  // Simple ASCII name without special characters
  return `${fromName} <${email}>`;
}

// Generate minimal RFC 5322 compliant extra headers
// IMPORTANT: Do NOT include From, To, Subject, Date, MIME-Version, Content-Type here
// These are core headers that denomailer generates itself - duplicates cause Gmail rejection
export function getEmailHeaders(domain: string = 'avisafe.no') {
  return {
    date: new Date().toUTCString(),
    headers: {
      "Message-ID": `<${crypto.randomUUID()}@${domain}>`,
      "X-Mailer": "AviSafe",
    },
  };
}

/**
 * Fetches email configuration from database first, falls back to environment variables
 * @param companyId - The company ID to fetch settings for
 * @returns EmailConfig object with SMTP settings
 */
export async function getEmailConfig(companyId?: string): Promise<EmailConfig> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let emailHost: string | undefined;
  let emailPort: number = 587;
  let emailUser: string | undefined;
  let emailPass: string | undefined;
  let emailSecure: boolean = false;
  let fromName: string | undefined;
  let fromEmail: string | undefined;

  // Try to fetch settings from database if companyId is provided
  if (companyId) {
    const { data: emailSettings, error: settingsError } = await supabase
      .from('email_settings')
      .select('*')
      .eq('company_id', companyId)
      .eq('enabled', true)
      .maybeSingle();

    if (settingsError) {
      console.error("Error fetching email settings:", settingsError);
    }

    if (emailSettings) {
      console.log("Using email settings from database for company:", companyId);
      emailHost = emailSettings.smtp_host?.toLowerCase();
      emailPort = emailSettings.smtp_port;
      emailUser = emailSettings.smtp_user;
      emailPass = emailSettings.smtp_pass;
      emailSecure = emailSettings.smtp_secure;
      fromName = emailSettings.from_name;
      fromEmail = emailSettings.from_email || emailSettings.smtp_user;

      // Only fall back to global credentials if the company has no password configured.
      // Never override a company's own credentials, even if they use send.one.com.
      if (!emailPass) {
        const secretPass = Deno.env.get('EMAIL_PASS');
        const secretUser = Deno.env.get('EMAIL_USER');
        if (secretPass) emailPass = secretPass;
        if (secretUser) {
          emailUser = secretUser;
          fromEmail = fromEmail || secretUser;
        }
        console.log("Company has no SMTP password – falling back to global credentials");
      }
    }
  }

  // Fallback to environment variables
  if (!emailHost || !emailUser || !emailPass) {
    console.log("Using email settings from environment variables");
    emailHost = Deno.env.get('EMAIL_HOST');
    emailPort = parseInt(Deno.env.get('EMAIL_PORT') || '587');
    emailUser = Deno.env.get('EMAIL_USER');
    emailPass = Deno.env.get('EMAIL_PASS');
    emailSecure = Deno.env.get('EMAIL_SECURE') === 'true';
    fromEmail = emailUser;
  }

  // Final fallback to default AviSafe SMTP settings from secrets
  if (!emailHost || !emailUser || !emailPass) {
    console.log("Using default AviSafe email settings from secrets");
    emailHost = Deno.env.get('EMAIL_HOST') || 'send.one.com';
    emailPort = parseInt(Deno.env.get('EMAIL_PORT') || '465');
    emailUser = Deno.env.get('EMAIL_USER') || 'noreply@avisafe.no';
    emailPass = Deno.env.get('EMAIL_PASS');
    emailSecure = Deno.env.get('EMAIL_SECURE') === 'true' || true;
    fromEmail = emailUser;
    fromName = 'AviSafe';
  }

  if (!emailPass) {
    throw new Error('No email password configured. Please set EMAIL_PASS secret.');
  }

  return {
    host: emailHost,
    port: emailPort,
    user: emailUser,
    pass: emailPass,
    secure: emailSecure,
    fromName,
    fromEmail: fromEmail!,
  };
}
