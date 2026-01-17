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

// Generate RFC 5322 compliant email headers to prevent spam blocking
export function getEmailHeaders(domain: string = 'avisafe.no') {
  return {
    date: new Date().toUTCString(),
    headers: {
      "Message-ID": `<${crypto.randomUUID()}@${domain}>`,
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
      emailHost = emailSettings.smtp_host?.toLowerCase(); // Ensure hostname is lowercase
      emailPort = emailSettings.smtp_port;
      emailUser = emailSettings.smtp_user;
      emailPass = emailSettings.smtp_pass;
      emailSecure = emailSettings.smtp_secure;
      fromName = emailSettings.from_name;
      fromEmail = emailSettings.from_email || emailSettings.smtp_user;
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

  // Final fallback to default AviSafe SMTP settings
  if (!emailHost || !emailUser || !emailPass) {
    console.log("Using default AviSafe email settings");
    emailHost = 'send.one.com';
    emailPort = 465;
    emailUser = 'noreply@avisafe.no';
    emailPass = 'Avisafe!';
    emailSecure = true;
    fromEmail = 'noreply@avisafe.no';
    fromName = 'AviSafe';
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
