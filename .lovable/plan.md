
# Fiks bulk-e-post: sender synkront i stedet for med waitUntil

## Rotsårsak bekreftet

Fra databasen ser vi at den siste kampanjen (`all_users`, 22 mottakere) resulterte i:
- `emails_sent: 0`
- `sent_to_emails: []`
- `failed_emails: [alle 22 adresser]`

Dette betyr at SMTP-tilkoblingene ble forsøkt opprettet, men alle feilet. `EdgeRuntime.waitUntil()` er ikke pålitelig for langvarige SMTP-operasjoner i Supabase Edge Functions — bakgrunnsprosessen drepes når HTTP-responsen er sendt, og alle tilkoblinger mislykkes.

Notifikasjons-e-poster (oppdrag til godkjenning, oppfølgingsansvar) fungerer fordi de sender e-postene **synkront** — SMTP åpnes, e-post sendes til 1-3 mottakere, deretter returneres respons. Ingen `waitUntil`.

## Løsning

Gjør bulk-e-post synkron, akkurat som notifikasjons-e-postene. Siden det bare er 22 mottakere, og hvert SMTP-kall tar ca. 1-2 sekunder, vil 22 e-poster ta ca. 22-44 sekunder totalt — noe Edge Functions kan håndtere (timeout er 150 sekunder som standard i Supabase).

Alle tre bulk-typer endres likt:
- `bulk_email_users`
- `bulk_email_customers`  
- `bulk_email_all_users`

### Hva som endres i koden

**Fjern `waitUntil`-mønsteret** og send e-postene direkte i samme asynkrone flyt, men returner HTTP-respons **etter** at alle er sendt.

```typescript
// FØR (ødelagt mønster):
const sendPromise = (async () => {
  for (const p of validProfiles) {
    // ... send email
  }
})();
EdgeRuntime.waitUntil(sendPromise);  // <-- drepes etter respons sendes
return new Response(...);            // <-- respons sendes før e-poster er sent

// ETTER (synkront, pålitelig):
for (const p of validProfiles) {
  // ... send email
}
await supabase.from('bulk_email_campaigns').update({ ... });
return new Response(...);            // <-- respons sendes ETTER alle e-poster er sent
```

### Konsekvens for brukeropplevelsen

Nettleseren venter nå i noen sekunder (ca. 1-2 sek per mottaker) før den får svar. For 22 mottakere betyr det ca. 22-44 sekunder. UI-en viser allerede en spinner med `sending: true`-tilstand, så dette er håndterbart. Alternativet (som nå) er at ingen e-poster sendes i det hele tatt.

### Filer som endres

| Fil | Endring |
|---|---|
| `supabase/functions/send-notification-email/index.ts` | Fjern `waitUntil`-mønsteret fra `bulk_email_users`, `bulk_email_customers` og `bulk_email_all_users`. Send synkront og returner respons etter at alle e-poster er forsøkt. |

### Ingen andre endringer nødvendig

- Kampanjelogging i `bulk_email_campaigns` beholdes som den er
- Dry Run-funksjonalitet beholdes uendret
- UI-kode i `BulkEmailSender.tsx` trenger ingen endringer
