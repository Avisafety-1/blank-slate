

## Plan: Nyhetsbrev-modul i Marketing med Resend Broadcasts

### Oversikt
Ny fane «Nyhetsbrev» i /marketing som bruker Resend sin Audiences + Broadcasts API for å administrere abonnenter og sende nyhetsbrev. Resend håndterer unsubscribe-flyt automatisk — når en mottaker klikker «Unsubscribe» i e-posten, markerer Resend kontakten som avmeldt og hopper over dem ved neste utsending.

### Steg 1: Database — `newsletter_broadcasts`-tabell
Lokal tabell for å logge sendte nyhetsbrev (emne, HTML, tidspunkt, Resend broadcast-ID, status). Ingen abonnent-tabell trengs — Resend er kilden til sannhet for kontakter.

```sql
CREATE TABLE newsletter_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  html_content text NOT NULL,
  resend_broadcast_id text,
  status text DEFAULT 'draft', -- draft, sent, scheduled, failed
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
ALTER TABLE newsletter_broadcasts ENABLE ROW LEVEL SECURITY;
-- Superadmin-only policy
```

### Steg 2: Edge function — `newsletter-manage`
Én edge function med actions:
- **`list-contacts`** — `GET https://api.resend.com/contacts` (lister alle kontakter)
- **`add-contact`** — `POST https://api.resend.com/contacts` med `email`, `first_name`, `last_name`
- **`remove-contact`** — `DELETE https://api.resend.com/contacts/{id}`
- **`create-broadcast`** — `POST https://api.resend.com/broadcasts` med `segment_id`, `from`, `subject`, `html`
- **`send-broadcast`** — `POST https://api.resend.com/broadcasts/{id}/send`
- **`import-contacts`** — looper over en liste med e-poster og legger dem til via API

Krever `RESEND_API_KEY` (allerede konfigurert) + en ny secret `RESEND_AUDIENCE_ID` (Resend Audience/Segment-ID som opprettes i Resend-dashbordet).

### Steg 3: UI — `MarketingNewsletter.tsx`
Ny komponent med tre underseksjoner:

1. **Abonnenter**: Viser kontaktliste fra Resend (navn, e-post, status). Knapp for å legge til enkeltpersoner. Import-knapp (kommaseparert e-postliste). Viser hvem som er avmeldt.
2. **Skriv nyhetsbrev**: Emne + HTML-editor (textarea med forhåndsvisning). Avsender er `noreply@avisafe.no`. Lagre som utkast, send nå, eller planlegg.
3. **Historikk**: Liste over sendte nyhetsbrev fra `newsletter_broadcasts`-tabellen.

### Steg 4: Sidebar-oppdatering
Legg til `"newsletter"` i `MarketingSection`-typen + nytt menyvalg med `Mail`-ikon.

### Steg 5: Oppsett av Resend Audience
Brukeren må opprette en Audience i Resend-dashbordet og legge inn ID-en som `RESEND_AUDIENCE_ID` secret. Alternativt kan vi opprette den via API i edge function.

### Filer som opprettes/endres
- `supabase/migrations/...` — `newsletter_broadcasts`-tabell
- `supabase/functions/newsletter-manage/index.ts` — ny edge function
- `src/components/marketing/MarketingNewsletter.tsx` — ny UI-komponent
- `src/components/marketing/MarketingSidebar.tsx` — legg til «Nyhetsbrev»-fane
- `src/pages/Marketing.tsx` — render `MarketingNewsletter` for ny seksjon

### Resend API — nøkkelendepunkter
```text
POST   /contacts                    — legg til kontakt
GET    /contacts                    — list kontakter  
DELETE /contacts/{id}               — slett kontakt
POST   /broadcasts                  — opprett broadcast (draft)
POST   /broadcasts/{id}/send        — send broadcast
```

Unsubscribe håndteres automatisk av Resend når `{{{RESEND_UNSUBSCRIBE_URL}}}` inkluderes i HTML-innholdet.

