export interface SendEmailParams {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

/**
 * Send an email via the Resend HTTP API.
 * Requires RESEND_API_KEY to be set as an edge function secret.
 */
export async function sendEmail({ from, to, subject, html, replyTo }: SendEmailParams) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');

  const body: Record<string, unknown> = {
    from,
    to: [to],
    subject,
    html,
  };

  if (replyTo) {
    body.reply_to = replyTo;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend error ${res.status}: ${errText}`);
  }

  return await res.json();
}
