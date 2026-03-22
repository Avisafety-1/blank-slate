

## Plan: Erstatt denomailer/SMTP med Resend API

### Oversikt
Alle 13 edge functions bruker i dag `denomailer` (SMTP) for å sende e-post via One.com. Vi erstatter dette med Resend sitt HTTP API, som er enklere, raskere og mer pålitelig enn SMTP fra edge functions.

### Steg 1: Legg til RESEND_API_KEY som secret
Du trenger API-nøkkelen din fra Resend-dashboardet (resend.com → API Keys). Vi legger den til som en Supabase edge function secret.

### Steg 2: Lag ny shared `sendEmail`-funksjon
Erstatt `email-config.ts` sin SMTP-logikk med en Resend HTTP-basert `sendEmail`-funksjon:

**Ny fil: `supabase/functions/_shared/resend-email.ts`**
- Eksporterer `sendEmail({ from, to, subject, html, replyTo? })` som kaller `https://api.resend.com/emails`
- Bruker `RESEND_API_KEY` fra miljøvariabler
- Beholder `getEmailConfig()` for å hente `fromName`/`fromEmail` per selskap fra databasen
- Beholder `sanitizeSubject()` og `formatSenderAddress()`

### Steg 3: Oppdater alle 13 edge functions
Fjern `SMTPClient`/`denomailer`-import og erstatt med `sendEmail` fra den nye shared filen. Berørte funksjoner:

1. `send-notification-email` (723 linjer — største, håndterer mange e-posttyper)
2. `send-customer-welcome-email`
3. `send-user-welcome-email`
4. `send-user-approved-email`
5. `send-password-reset`
6. `send-calendar-link`
7. `send-feedback`
8. `invite-user`
9. `check-document-expiry`
10. `check-maintenance-expiry`
11. `check-competency-expiry`
12. `check-long-flights`
13. `resend-confirmation-email`
14. `test-email`

For hver funksjon:
- Fjern `import { SMTPClient } from "denomailer"`
- Fjern `new SMTPClient(...)`, `client.send(...)`, `client.close()`
- Erstatt med `await sendEmail({ from, to, subject, html })`

### Steg 4: Oppdater `email-config.ts`
- Fjern SMTP-spesifikke felt (`host`, `port`, `user`, `pass`, `secure`) fra `EmailConfig`
- Behold `fromName` og `fromEmail` (brukes fortsatt for avsenderadresse)
- Behold `getEmailConfig()` for selskaps-spesifikke avsenderinnstillinger fra databasen
- Fjern `getEmailHeaders()` (ikke nødvendig med Resend API)

### Steg 5: Håndter per-selskap avsender
Resend krever at avsenderdomenet er verifisert. Hvis selskaper bruker egne domener, må de verifiseres i Resend. Default-avsender blir `noreply@avisafe.no` (allerede verifisert via One.com-koblingen din).

### Teknisk detalj — sendEmail-funksjonen

```typescript
export async function sendEmail({ from, to, subject, html, replyTo }: {
  from: string; to: string; subject: string; html: string; replyTo?: string;
}) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, reply_to: replyTo }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }
  return await res.json();
}
```

### Filer som endres
- `supabase/functions/_shared/resend-email.ts` — ny fil
- `supabase/functions/_shared/email-config.ts` — forenklet (fjern SMTP)
- 14 edge functions — erstatt SMTP med `sendEmail()`

### Forutsetning
Du må ha Resend API-nøkkelen klar. Den finner du på [resend.com/api-keys](https://resend.com/api-keys).

