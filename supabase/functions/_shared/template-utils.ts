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
  },
  
  followup_assigned: {
    subject: 'Du er tildelt som oppfølgingsansvarlig: {{incident_title}}',
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.incident-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #f59e0b; }
.severity { display: inline-block; padding: 4px 12px; border-radius: 4px; color: white; background: #f59e0b; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Oppfølgingsansvarlig tildelt</h1>
</div>
<div class="content">
<p>Hei {{user_name}},</p>
<p>Du har blitt tildelt som oppfølgingsansvarlig for følgende hendelse:</p>
<div class="incident-box">
<h2 style="margin-top: 0;">{{incident_title}}</h2>
<p><strong>Alvorlighetsgrad:</strong> <span class="severity">{{incident_severity}}</span></p>
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
  
  user_approved: {
    subject: 'Din konto er godkjent - {{company_name}}',
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
.content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
.success-icon { font-size: 48px; margin-bottom: 15px; }
.button { display: inline-block; background: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
.footer { text-align: center; margin-top: 20px; font-size: 12px; color: #888; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<div class="success-icon">✓</div>
<h1 style="margin: 0;">Velkommen til {{company_name}}!</h1>
</div>
<div class="content">
<h2>Hei {{user_name}}!</h2>
<p>Vi er glade for å informere deg om at brukerkontoen din hos <strong>{{company_name}}</strong> nå er godkjent.</p>
<p>Du har nå full tilgang til systemet og kan begynne å bruke alle funksjonene som er tilgjengelige for deg.</p>
<p style="text-align: center;">
<a href="https://app.avisafe.no" class="button">Logg inn nå</a>
</p>
<p>Hvis du har spørsmål eller trenger hjelp med å komme i gang, ikke nøl med å kontakte oss.</p>
<p>Med vennlig hilsen,<br>{{company_name}}</p>
<div class="footer">
<p>Dette er en automatisk generert e-post fra AviSafe.</p>
</div>
</div>
</div>
</body>
</html>`
  },
  
  customer_welcome: {
    subject: 'Velkommen som kunde hos {{company_name}}',
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
.content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
.welcome-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6; }
.footer { text-align: center; margin-top: 20px; font-size: 12px; color: #888; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1 style="margin: 0;">Velkommen som kunde!</h1>
</div>
<div class="content">
<h2>Hei {{customer_name}}!</h2>
<p>Vi er glade for å ønske deg velkommen som kunde hos <strong>{{company_name}}</strong>.</p>
<div class="welcome-box">
<p style="margin: 0;">Du er nå registrert i vårt system. Vi ser frem til et godt samarbeid og vil gjøre vårt beste for å levere tjenester av høy kvalitet.</p>
</div>
<p>Hvis du har spørsmål eller trenger mer informasjon, er du hjertelig velkommen til å ta kontakt med oss.</p>
<p>Med vennlig hilsen,<br>{{company_name}}</p>
<div class="footer">
<p>Dette er en automatisk generert e-post fra AviSafe.</p>
</div>
</div>
</div>
</body>
</html>`
  },
  
  mission_confirmation: {
    subject: 'Oppdragsbekreftelse: {{mission_title}}',
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.mission-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; }
.detail-row { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
.detail-row:last-child { border-bottom: none; }
.label { color: #666; font-weight: bold; }
.status { display: inline-block; padding: 4px 12px; border-radius: 4px; background: #dbeafe; color: #1e40af; font-weight: bold; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Oppdragsbekreftelse</h1>
</div>
<div class="content">
<p>Dette bekrefter følgende oppdrag:</p>
<div class="mission-box">
<h2 style="margin-top: 0; color: #1e40af;">{{mission_title}}</h2>
<div class="detail-row">
<span class="label">Status:</span> <span class="status">{{mission_status}}</span>
</div>
<div class="detail-row">
<span class="label">Lokasjon:</span> {{mission_location}}
</div>
<div class="detail-row">
<span class="label">Tidspunkt:</span> {{mission_date}}
</div>
</div>
<p>Logg inn i AviSafe for mer informasjon og detaljer om oppdraget.</p>
<p>Med vennlig hilsen,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`
  },
  
  document_reminder: {
    subject: 'Dokument utløper snart: {{document_title}}',
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
.content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
.warning-icon { font-size: 48px; margin-bottom: 15px; }
.document-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444; }
.expiry-date { color: #dc2626; font-weight: bold; font-size: 18px; }
.button { display: inline-block; background: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<div class="warning-icon">⚠️</div>
<h1 style="margin: 0;">Dokument utløper snart</h1>
</div>
<div class="content">
<p>Dette er en påminnelse om at følgende dokument snart utløper:</p>
<div class="document-box">
<h2 style="margin-top: 0;">{{document_title}}</h2>
<p><strong>Utløpsdato:</strong> <span class="expiry-date">{{expiry_date}}</span></p>
</div>
<p>Vi anbefaler at du fornyer eller oppdaterer dette dokumentet så snart som mulig for å unngå avbrudd i driften.</p>
<p style="text-align: center;">
<a href="https://app.avisafe.no" class="button">Gå til dokumenter</a>
</p>
<p>Med vennlig hilsen,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`
  },
  
  maintenance_reminder: {
    subject: 'Vedlikeholdspåminnelse: {{item_count}} ressurser krever oppmerksomhet',
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
.content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
.tool-icon { font-size: 48px; margin-bottom: 15px; }
.items-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb; }
.items-list { white-space: pre-line; font-family: monospace; background: #f3f4f6; padding: 15px; border-radius: 6px; margin: 15px 0; }
.count-badge { display: inline-block; background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 20px; font-weight: bold; }
.button { display: inline-block; background: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<div class="tool-icon">🔧</div>
<h1 style="margin: 0;">Vedlikeholdspåminnelse</h1>
</div>
<div class="content">
<p>Hei {{user_name}},</p>
<p>Følgende ressurser har vedlikehold eller inspeksjon som nærmer seg:</p>
<div class="items-box">
<p><span class="count-badge">{{item_count}} ressurser</span></p>
<div class="items-list">{{items_list}}</div>
</div>
<p>Vi anbefaler at du planlegger nødvendig vedlikehold for å sikre at utstyret er i optimal stand.</p>
<p style="text-align: center;">
<a href="https://app.avisafe.no" class="button">Gå til ressurser</a>
</p>
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
    const content = replaceTemplateVariables(customTemplate.content, variables);
    return {
      subject: replaceTemplateVariables(customTemplate.subject, variables),
      content: fixEmailImages(content),
      isCustom: true
    };
  }
  
  const defaultTemplate = defaultTemplates[templateType];
  if (defaultTemplate) {
    const content = replaceTemplateVariables(defaultTemplate.content, variables);
    return {
      subject: replaceTemplateVariables(defaultTemplate.subject, variables),
      content: fixEmailImages(content),
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

/**
 * Fixes images in email HTML to ensure they display correctly in email clients.
 * Adds proper styling, width constraints, and display properties to <img> tags.
 */
export function fixEmailImages(html: string): string {
  // Match img tags without proper styling
  return html.replace(/<img\s+([^>]*?)>/gi, (match, attributes) => {
    // Skip if already has inline width/style with max-width
    if (attributes.includes('max-width')) {
      return match;
    }
    
    // Extract src attribute
    const srcMatch = attributes.match(/src=["']([^"']+)["']/i);
    if (!srcMatch) return match;
    
    // Build new attributes, preserving src and alt
    const altMatch = attributes.match(/alt=["']([^"']*)["']/i);
    const alt = altMatch ? altMatch[1] : 'Bilde';
    
    // Create properly styled image tag for email clients
    return `<img src="${srcMatch[1]}" alt="${alt}" width="560" style="max-width:100%;height:auto;display:block;border:0;" />`;
  });
}
