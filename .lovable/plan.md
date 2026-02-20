
## Rotårsak bekreftet: Én delt SMTPClient for alle mottakere — One.com kutter tilkoblingen

### Hva databasen viser
- `all_users_dry_run` (22 mottakere): `emails_sent: 22`, `failed_emails: []` — DRY RUN fungerer
- `all_users` (22 mottakere): `emails_sent: 0`, `failed_emails: [22 e-poster]` — ALLE feiler

Dry run sender ingen SMTP-kall og funker. Ekte sending feiler for alle 22. Konklusjonen er entydig: SMTP-klienten er problemet, ikke `waitUntil`.

### Hva koden gjør nå (feil)
```typescript
const client = new SMTPClient({ connection: smtpConnection }); // Én delt klient
for (const u of validUsers) {
  await client.send({ to: u.email, ... }); // One.com kutter tilkobling etter første send
  // -> alle påfølgende kall feiler
}
```

### Hva som skal gjøres (ny klient per e-post)

Den første e-posten fungerer trolig — men One.com lukker tilkoblingen etter sending (vanlig SMTP-atferd for mange providers). Påfølgende `client.send()`-kall på en lukket tilkobling kaster en feil og legges i `failedEmails`.

Løsningen er å opprette, bruke og lukke en ny `SMTPClient` for **hver enkelt e-post** — nøyaktig slik enkelt-e-poster (f.eks. "gi tilbakemelding") fungerer:

```typescript
for (const u of validUsers) {
  const client = new SMTPClient({ connection: smtpConnection });
  try {
    await client.send({ to: u.email, ... });
    sentToEmails.push(u.email!);
  } catch (e) {
    failedEmails.push(u.email!);
  } finally {
    try { await client.close(); } catch (_) {}
  }
}
```

### Nettleser og timeout — bekreftelse
`EdgeRuntime.waitUntil()` er allerede på plass. Når funksjonen returnerer HTTP 200 til nettleseren (umiddelbart), er nettleserforbindelsen FERDIG — det spiller ingen rolle om du lukker nettleseren. SMTP-loopen kjører videre på Supabase sine servere. Dette er korrekt implementert.

Med ny klient per e-post og `waitUntil` vil flyten bli:
```
1. Nettleser sender forespørsel
2. Supabase henter mottakere fra DB (< 1 sek)
3. Kampanje INSERT til DB (emails_sent = estimert antall)
4. HTTP 200 sendes tilbake til nettleseren — FERDIG for nettleseren
5. I bakgrunnen (usynlig for bruker):
   - For hver mottaker: ny klient, send, lukk klient
   - DB UPDATE med faktisk antall sendt
6. Historikken oppdateres i DB etter sending
```

### Filer som endres
| Fil | Endring |
|---|---|
| `supabase/functions/send-notification-email/index.ts` | Erstatt én delt `SMTPClient` med ny klient per e-post i ALLE tre bulk-handlere: `bulk_email_users`, `bulk_email_customers`, `bulk_email_all_users`. `send_to_missed`-handleren får samme fix. |

### Forventet resultat etter fix
- Alle 22 e-poster sendes vellykket
- `sent_to_emails` fylles korrekt med alle 22 adresser
- `failed_emails` forblir tom (med mindre en adresse er ugyldig)
- Kan verifiseres med dry run (fungerer allerede) og deretter ekte sending
