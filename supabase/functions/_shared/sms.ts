/** Shared GatewayAPI SMS helper. */

/** Convert a phone number string to MSISDN integer (country code + number, no plus).
 * Norwegian mobile numbers (8 digits starting with 4/9) get +47 prepended. */
export function normalizeMsisdn(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (/^\d{8}$/.test(digits) && /^[49]/.test(digits)) digits = '47' + digits;
  if (!/^\d{8,15}$/.test(digits)) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

export interface SmsSendResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/** Send a single SMS via GatewayAPI through the Lovable connector gateway. */
export async function sendGatewaySms(params: {
  phone: string | null | undefined;
  message: string;
  reference?: string;
  sender?: string;
}): Promise<SmsSendResult> {
  const msisdn = normalizeMsisdn(params.phone);
  if (!msisdn) return { ok: false, error: 'invalid_phone' };

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const GATEWAYAPI_API_KEY = Deno.env.get('GATEWAYAPI_API_KEY');
  if (!LOVABLE_API_KEY || !GATEWAYAPI_API_KEY) {
    return { ok: false, error: 'gatewayapi_not_configured' };
  }

  try {
    const res = await fetch('https://connector-gateway.lovable.dev/gatewayapi/mobile/single', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': GATEWAYAPI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: params.sender ?? 'AviSafe',
        recipient: msisdn,
        message: params.message,
        reference: params.reference,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[sms] send failed [${res.status}]: ${body}`);
      return { ok: false, status: res.status, error: body };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    console.error('[sms] send exception', e);
    return { ok: false, error: String(e) };
  }
}

/** Build the "mission awaiting approval" SMS text based on user preferred language. */
export function buildApprovalSmsMessage(params: {
  missionTitle: string;
  missionDate: string; // pre-formatted local string
  hoursUntil: number;
  language?: string | null;
}): string {
  const isEn = String(params.language ?? '').toLowerCase().startsWith('en');
  const h = params.hoursUntil;
  if (isEn) {
    const timing = h < 0
      ? `started ${Math.abs(h).toFixed(1)}h ago`
      : h < 1
        ? `in ${Math.round(h * 60)} min`
        : `in ${h.toFixed(1)}h`;
    return `AviSafe: Mission "${params.missionTitle}" is awaiting your approval. Starts ${params.missionDate} (${timing}). Log in to approve.`;
  }
  const timing = h < 0
    ? `startet for ${Math.abs(h).toFixed(1)}t siden`
    : h < 1
      ? `om ${Math.round(h * 60)} min`
      : `om ${h.toFixed(1)}t`;
  return `AviSafe: Oppdrag «${params.missionTitle}» venter på din godkjenning. Start ${params.missionDate} (${timing}). Logg inn for å godkjenne.`;
}
