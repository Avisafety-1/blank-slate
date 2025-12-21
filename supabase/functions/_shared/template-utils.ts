import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface EmailTemplateResult {
  subject: string;
  content: string;
  isCustom: boolean;
}

/**
 * Fetches an email template from the database or returns null if not found
 */
export async function getEmailTemplate(
  companyId: string,
  templateType: string
): Promise<{ subject: string; content: string } | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('email_templates')
    .select('subject, content')
    .eq('company_id', companyId)
    .eq('template_type', templateType)
    .maybeSingle();

  if (error) {
    console.error(`Error fetching email template ${templateType}:`, error);
    return null;
  }

  return data;
}

/**
 * Replaces template variables with actual values
 */
export function replaceTemplateVariables(
  content: string,
  variables: Record<string, string>
): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  return result;
}

/**
 * Default email templates for each notification type
 */
export const defaultTemplates: Record<string, { subject: string; content: string }> = {
  password_reset: {
    subject: 'Tilbakestill passord - AviSafe',
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.button { display: inline-block; background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
.warning { background: #fef3c7; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #f59e0b; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Tilbakestill passord</h1>
</div>
<div class="content">
<p>Hei {{user_name}},</p>
<p>Vi har mottatt en forespørsel om å tilbakestille passordet ditt. Klikk på knappen nedenfor for å fortsette:</p>
<a href="{{reset_link}}" class="button">Tilbakestill passord</a>
<div class="warning">
<p><strong>Viktig:</strong> Denne lenken utløper om 1 time av sikkerhetsgrunner.</p>
</div>
<p>Hvis du ikke har bedt om å tilbakestille passordet ditt, kan du ignorere denne e-posten.</p>
<p>Med vennlig hilsen,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`
  },
  
  admin_new_user: {
    subject: 'Ny bruker venter på godkjenning',
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.user-info { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #1e40af; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Ny bruker venter på godkjenning</h1>
</div>
<div class="content">
<p>En ny bruker har registrert seg og venter på godkjenning.</p>
<div class="user-info">
<p><strong>Navn:</strong> {{new_user_name}}</p>
<p><strong>E-post:</strong> {{new_user_email}}</p>
<p><strong>Selskap:</strong> {{company_name}}</p>
</div>
<p style="margin-top: 20px;">Logg inn i AviSafe for å godkjenne eller avslå denne brukeren.</p>
</div>
</div>
</body>
</html>`
  },
  
  incident_notification: {
    subject: 'Ny hendelse: {{incident_title}}',
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.incident-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; }
.severity { display: inline-block; padding: 4px 12px; border-radius: 4px; color: white; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Ny hendelse rapportert</h1>
</div>
<div class="content">
<div class="incident-box">
<h2 style="margin-top: 0;">{{incident_title}}</h2>
<p><strong>Alvorlighetsgrad:</strong> <span class="severity" style="background: #f59e0b;">{{incident_severity}}</span></p>
<p><strong>Lokasjon:</strong> {{incident_location}}</p>
<p><strong>Beskrivelse:</strong></p>
<p>{{incident_description}}</p>
</div>
<p>Logg inn i AviSafe for å se detaljer og følge opp hendelsen.</p>
<p>Med vennlig hilsen,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`
  },
  
  mission_notification: {
    subject: 'Nytt oppdrag: {{mission_title}}',
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.mission-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Nytt oppdrag planlagt</h1>
</div>
<div class="content">
<div class="mission-box">
<h2 style="margin-top: 0;">{{mission_title}}</h2>
<table style="width: 100%;">
<tr><td style="padding: 8px 0; color: #666;"><strong>Status:</strong></td><td>{{mission_status}}</td></tr>
<tr><td style="padding: 8px 0; color: #666;"><strong>Lokasjon:</strong></td><td>{{mission_location}}</td></tr>
<tr><td style="padding: 8px 0; color: #666;"><strong>Tidspunkt:</strong></td><td>{{mission_date}}</td></tr>
</table>
<p style="margin-top: 15px;"><strong>Beskrivelse:</strong></p>
<p>{{mission_description}}</p>
</div>
<p>Logg inn i AviSafe for mer informasjon.</p>
<p>Med vennlig hilsen,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`
  },
  
  user_welcome: {
    subject: 'Velkommen til {{company_name}}',
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Velkommen til {{company_name}}!</h1>
</div>
<div class="content">
<p>Hei {{user_name}},</p>
<p>Velkommen som bruker hos {{company_name}}. Din konto er nå opprettet og venter på godkjenning av en administrator.</p>
<p>Du vil motta en e-post når kontoen din er godkjent.</p>
<p>Med vennlig hilsen,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`
  }
};

/**
 * Gets email template with fallback to default
 */
export async function getEmailTemplateWithFallback(
  companyId: string,
  templateType: string,
  variables: Record<string, string>
): Promise<EmailTemplateResult> {
  const customTemplate = await getEmailTemplate(companyId, templateType);
  
  if (customTemplate) {
    return {
      subject: replaceTemplateVariables(customTemplate.subject, variables),
      content: replaceTemplateVariables(customTemplate.content, variables),
      isCustom: true
    };
  }
  
  const defaultTemplate = defaultTemplates[templateType];
  if (defaultTemplate) {
    return {
      subject: replaceTemplateVariables(defaultTemplate.subject, variables),
      content: replaceTemplateVariables(defaultTemplate.content, variables),
      isCustom: false
    };
  }
  
  // Return empty template if no default exists
  return {
    subject: '',
    content: '',
    isCustom: false
  };
}
