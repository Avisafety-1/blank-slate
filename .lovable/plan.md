
## Fix: bulk_email_all_users timer ut — kampanje lagres aldri

### Rotårsak (bekreftet via analytics-logger)
Edge-funksjonen timed ut med **504 etter 150 sekunder** under siste sending til 22 brukere. SMTP-kall skjer sekvensielt (én om gangen), og `bulk_email_campaigns`-INSERT ligger **etter** hele send-loopen, så ved timeout forsvinner all logginfo.

### To problemer som løses

#### Problem 1: Campaign INSERT skjer etter sending (kritisk)
INSERT til `bulk_email_campaigns` plasseres **før** send-loopen. Da logges kampanjen med `emails_sent = 0` umiddelbart, og oppdateres med faktisk antall etter at loopen er ferdig (via UPDATE). Hvis funksjonen timer ut under sending, er kampanjeloggen uansett lagret.

#### Problem 2: Sekvensiell SMTP er for treg (ytelse)
I stedet for å sende én og én, sendes e-poster i **parallelle batches på 5** med `Promise.allSettled()`. Med 22 mottakere gir dette ca. 5 runder à 5 e-poster istedenfor 22 runder. Dette er en ca. 4x hastighetsøkning og bringer sendingen godt innenfor 150-sekundersgrensen.

### Konkret kodestruktur (bulk_email_all_users)

**Før (dagens kode):**
```
1. Hent alle brukere
2. For each user: send e-post (sekvensielt, 22 kall)
3. await client.close()
4. INSERT bulk_email_campaigns  ← timer ut ALDRI her
```

**Etter (ny kode):**
```
1. Hent alle brukere
2. INSERT bulk_email_campaigns med emails_sent=0  ← lagres alltid
3. Send i batches på 5 med Promise.allSettled()
4. await client.close()
5. UPDATE bulk_email_campaigns med faktisk antall sendt
```

### Samme fix gjelder også bulk_email_users og bulk_email_customers
Disse bruker også sekvensiell sending og INSERT etter loop. Alle tre handlers får samme forbedring.

### Filer som endres
| Fil | Endring |
|-----|---------|
| `supabase/functions/send-notification-email/index.ts` | Flytt INSERT til før send-loopen for alle tre bulk-handlers; bytt til batch-parallell sending |

### Forventet resultat
- Kampanjen lagres alltid i `bulk_email_campaigns`, selv om noe feiler under sending
- Sending av 22 e-poster tar ca. 30-40 sekunder istedenfor 150+
- «Tidligere kampanjer»-seksjonen viser korrekte data etter sending
- «Send til nye»-funksjonen vil fungere korrekt fordi `sent_to_emails` er lagret
