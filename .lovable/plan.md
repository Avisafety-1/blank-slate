
## Bulk-e-post kampanjelogg med "send til nye brukere"-funksjon

### Problemet
Når en bulk-e-post sendes, lagres ingen informasjon om hvem som faktisk mottok den. Dette betyr at nye brukere som registrerer seg etter utsendelsen automatisk går glipp av viktige meldinger, og det er ingen måte å ettersende dem uten å sende til alle igjen.

### Løsningen
Innfør en `bulk_email_campaigns`-tabell som lagrer hver utsendelse med emne, innhold og en liste over hvem som fikk e-posten. Deretter kan admin velge en tidligere kampanje og sende den til alle brukere som *ikke* allerede har mottatt den.

---

### Del 1 — Ny databasetabell: `bulk_email_campaigns`

```text
bulk_email_campaigns
├── id (uuid, PK)
├── company_id (uuid)            -- null = system-wide (all_users)
├── recipient_type (text)        -- 'users' | 'customers' | 'all_users'
├── subject (text)
├── html_content (text)
├── sent_at (timestamptz)
├── sent_by (uuid)               -- profil-ID til avsender
├── emails_sent (int)
├── sent_to_emails (text[])      -- array av e-postadresser som fikk mailen
└── failed_emails (text[])       -- array av e-postadresser som feilet
```

RLS-policy: Kun superadmin og admin i samme selskap kan lese/skrive.

---

### Del 2 — Oppdater Edge Function `send-notification-email`

For `bulk_email_users`, `bulk_email_customers` og `bulk_email_all_users`:

1. Etter vellykket utsendelse, lagre en rad i `bulk_email_campaigns` med alle mottakere i `sent_to_emails`-kolonnen
2. Returner kampanje-ID i svaret slik at frontend kan referere til den

For ny `send_to_missed`-type:
1. Ta imot en `campaignId`
2. Les `sent_to_emails` fra kampanjen
3. Finn alle nåværende mottakere (basert på `recipient_type`)
4. Send kun til de som **ikke** finnes i `sent_to_emails`
5. Oppdater kampanjen med de nye mottakerne

---

### Del 3 — Ny UI-seksjon i `BulkEmailSender.tsx`: "Tidligere kampanjer"

Under e-postsendeskjemaet vises en liste over tidligere kampanjer med:
- Dato og emne
- Antall mottakere
- Knapp: **"Send til nye mottakere"** — klikk åpner en bekreftelsesdialog som viser antall brukere som ikke fikk e-posten
- Ingen ny innholdsredigering nødvendig — bruker lagret HTML fra kampanjen

---

### Flyten visuelt

```text
Admin sender bulk-e-post
        │
        ▼
Edge Function sender e-poster
        │
        ▼
Lagrer kampanje i bulk_email_campaigns
  - subject, html_content, sent_to_emails[]
        │
        ▼
Ny bruker registrerer seg (f.eks. neste uke)
        │
        ▼
Admin ser kampanje → klikker "Send til nye"
        │
        ▼
Edge Function: finn brukere IKKE i sent_to_emails[]
        │
        ▼
Sender kun til nye → oppdaterer sent_to_emails[]
```

---

### Filer som endres/opprettes

| Fil | Endring |
|-----|---------|
| Ny migrering | `bulk_email_campaigns`-tabell med RLS |
| `supabase/functions/send-notification-email/index.ts` | Lagre kampanje etter sending + ny `send_to_missed`-type |
| `src/components/admin/BulkEmailSender.tsx` | Vis kampanjehistorikk + "Send til nye"-knapp |

### Teknisk merknad
`sent_to_emails` lagres som `text[]` (PostgreSQL array), noe som gir enkel `NOT IN`-filtrering uten behov for en koblingstabell. For system-wide kampanjer (`all_users`) sammenlignes mot `auth.users.email` via `listUsers()`. For selskaps-spesifikke kampanjer sammenlignes mot `profiles.email` eller `customers.epost`.
