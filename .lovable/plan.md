
## Fix: Nettleseren timer ut — Edge Function må svare umiddelbart og sende i bakgrunnen

### Rotårsak (bekreftet via network-logger)
- Dry run (`dry_run: true`) returnerte 200 på under 1 sekund — OK
- Ekte send (`dry_run: false`) fikk "Load failed" — nettleseren droppet TCP-forbindelsen etter ~60-90 sekunder
- 22 sekvensielle SMTP-kall tar for lang tid til at nettleseren venter

Supabase Edge Functions støtter `EdgeRuntime.waitUntil()` — dette lar funksjonen returnere HTTP-respons umiddelbart, mens SMTP-utsendelsen fortsetter i bakgrunnen.

### Ny arkitektur

```
1. Motta forespørsel
2. Hent mottakere fra DB
3. INSERT kampanje til bulk_email_campaigns (status = "sending")
4. Returner HTTP 200 umiddelbart med campaignId
5. I bakgrunnen (waitUntil): send alle e-poster sekvensielt
6. UPDATE kampanje med faktisk antall sendt (status = "completed")
```

### Konkret kodeendring

Alle tre bulk-handlere (`bulk_email_users`, `bulk_email_customers`, `bulk_email_all_users`) får følgende struktur:

```typescript
// 1. Hent mottakere
const validProfiles = ...; 

// 2. Lag kampanjelogg
const { data: campaign } = await supabase.from('bulk_email_campaigns')
  .insert({ ..., emails_sent: 0 }).select('id').single();

// 3. Svar umiddelbart
const sendPromise = (async () => {
  const client = new SMTPClient({ ... });
  try {
    for (const p of validProfiles) {
      try {
        await client.send({ ... });
        sentToEmails.push(p.email);
      } catch (e) {
        failedEmails.push(p.email);
      }
    }
  } finally {
    await client.close();
    // Oppdater kampanje med faktisk resultat
    await supabase.from('bulk_email_campaigns').update({
      emails_sent: sentToEmails.length,
      sent_to_emails: sentToEmails,
      failed_emails: failedEmails,
    }).eq('id', campaign.id);
  }
})();

// 4. Returner med en gang
EdgeRuntime.waitUntil(sendPromise);
return new Response(JSON.stringify({ 
  success: true, 
  emailsSent: validProfiles.length, // estimert
  campaignId: campaign.id 
}), { headers: corsHeaders, status: 200 });
```

### UI-konsekvens
Når UI mottar respons umiddelbart, vises toast med "E-post sendes til X mottakere..." og kampanjen dukker opp i historikken med `emails_sent: 0` umiddelbart. Etter noen sekunder kan brukeren refreshe historikken og se det faktiske antallet.

For å gjøre dette ryddig, endres toast-meldingen til "Sender e-post til {estimert} mottakere — kampanje opprettet" (istedenfor å vise 0).

### Filer som endres
| Fil | Endring |
|-----|---------|
| `supabase/functions/send-notification-email/index.ts` | Bruk `EdgeRuntime.waitUntil()` for alle tre bulk-handlere; svar umiddelbart med estimert antall |
| `src/components/admin/BulkEmailSender.tsx` | Oppdater toast-melding for å tydeliggjøre at sending pågår i bakgrunnen |

### Resultat
- Ingen timeout — UI får svar på under 1 sekund
- Kampanje lagres alltid i historikken
- E-poster sendes stille i bakgrunnen
- Kampanjelogg oppdateres automatisk med faktisk antall etter sending
