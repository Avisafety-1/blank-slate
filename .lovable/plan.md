
## Fix: SMTPClient støtter ikke parallell bruk — bytt til sekvensiell sending + dry_run-modus

### Rotårsak (bekreftet via logg)
Edge-funksjonen logger `"starting send to 22 users"` men når aldri `"complete"` — den henger/timeout-er under SMTP-sendingen. Årsaken er at `denomailer` sin `SMTPClient` **ikke er trådsikker for parallell bruk**. Når `Promise.allSettled` sender 5 e-poster samtidig med *samme klientinstans*, kolliderer de interne TCP-tilstandene og funksjonen henger.

### To endringer som gjøres

#### Fix 1 — Bytt til sekvensiell sending, men med ny klientinstans per mottaker (raskere enn det høres ut)
I stedet for parallell sending med én delt klient, opprettes én SMTP-klient per e-post (eller én per batch som åpnes/lukkes). Det enkleste og mest robuste er å sende sekvensielt men uten auth-kall per bruker (det er allerede fikset). Med 22 brukere og ~2-4 sek per SMTP-kall, tar dette ~60-90 sekunder — fortsatt innenfor 150s-grensen.

For å gjøre dette raskere og pålitelig: opprett én klient, send sekvensielt med `try/catch` per e-post. Dette er det `denomailer` faktisk er designet for.

#### Fix 2 — Legg til `dry_run: true`-støtte for testing
Når `dry_run: true` sendes i request-body, hoppes alle faktiske `client.send()`-kall over. Kampanjen logges i databasen med alle mottakere i `sent_to_emails` (slik at du kan se hvem *ville ha fått* e-post), men ingen epost sendes faktisk. Dette lar deg teste kampanjelogikken uten å sende til alle.

### Kodestruktur etter fix

**bulk_email_users (og de andre to handlersene):**
```typescript
// Én klient, sekvensiell sending med try/catch per bruker
const client = new SMTPClient({ connection: smtpConnection });
try {
  for (const p of validProfiles) {
    try {
      if (!dryRun) {
        await client.send({ from, to: p.email!, subject, html });
      }
      sentToEmails.push(p.email!);
      console.info(`✓ ${dryRun ? '[DRY RUN]' : ''} sent to ${p.email}`);
    } catch (e) {
      failedEmails.push(p.email!);
      console.error(`✗ failed for ${p.email}`, e);
    }
  }
} finally {
  if (!dryRun) await client.close();
}
```

### Filer som endres
| Fil | Endring |
|-----|---------|
| `supabase/functions/send-notification-email/index.ts` | Fjern `Promise.allSettled` parallell-batch; bytt til sekvensiell loop med én delt klient; legg til `dry_run` parameter-støtte i alle tre bulk-handlersene |

### Dry Run bruk fra UI (for testing)
I `BulkEmailSender.tsx` legges det til en "Test (dry run)"-knapp ved siden av "Send"-knappen. Ved klikk sendes `dry_run: true` i request-body — kampanjen vises i historikken med riktig mottakerliste, men ingen e-post sendes faktisk.

### Filer som endres totalt
| Fil | Endring |
|-----|---------|
| `supabase/functions/send-notification-email/index.ts` | Sekvensiell SMTP, `dry_run`-støtte |
| `src/components/admin/BulkEmailSender.tsx` | Legg til "Test (dry run)"-knapp |

### Forventet resultat
- Sending fullfører uten timeout (sekvensiell = pålitelig)
- Kampanje lagres alltid i historikken
- Dry run lar deg verifisere mottakerliste uten å sende ut epost til alle
