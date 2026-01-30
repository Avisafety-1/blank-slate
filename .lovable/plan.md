

# Plan: Kalenderabonnement (live .ics-feed)

## Oversikt
Implementerer en "Abonner på kalender"-funksjon som gir brukerne en unik URL de kan legge til i Google Calendar, Apple Calendar eller Samsung Calendar. Kalenderen oppdateres automatisk når nye hendelser legges til i AviSafe.

## Hvordan det fungerer

1. Bruker klikker "Generer abonnementslenke" i dialogen
2. System genererer et unikt, sikkert token knyttet til brukerens selskap
3. Bruker får en URL som kan kopieres og limes inn i kalenderappen
4. Når kalenderappen henter URL-en, returnerer edge function en .ics-fil med alle selskapets hendelser
5. Kalenderappen oppdaterer automatisk (typisk hver 15-60 min)

---

## Teknisk implementering

### Del 1: Ny databasetabell for tokens

Oppretter `calendar_subscriptions` tabell:

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | uuid | Primærnøkkel |
| company_id | uuid | Selskapets ID (for å hente riktige data) |
| user_id | uuid | Bruker som opprettet tokenet |
| token | text | Unikt, sikkert token (64 tegn) |
| created_at | timestamp | Opprettelsestidspunkt |
| last_accessed_at | timestamp | Sist hentet (for statistikk) |

RLS-policies:
- Brukere kan opprette tokens for eget selskap
- Brukere kan se egne tokens
- Brukere kan slette egne tokens

### Del 2: Edge function `calendar-feed`

Ny edge function som:
- Tar imot token som query-parameter (`?token=xxx`)
- Validerer token mot `calendar_subscriptions`-tabellen
- Bruker `company_id` fra tokenet til å hente data (ikke brukerautentisering)
- Returnerer .ics-fil med Content-Type: `text/calendar`
- Oppdaterer `last_accessed_at` ved hver forespørsel

Viktig: Denne funksjonen må ha `verify_jwt = false` fordi kalenderapper ikke kan autentisere.

Datakilder (alle filtrert på company_id via service role):
- calendar_events
- missions
- documents (utløpsdatoer)
- drones (inspeksjonsdatoer)
- equipment (vedlikeholdsdatoer)
- drone_accessories (vedlikeholdsdatoer)

### Del 3: Oppdater CalendarExportDialog

Legger til ny seksjon i dialogen:

```text
┌─────────────────────────────────────────────┐
│ 📅 Synkroniser kalender                     │
│                                             │
│ Tidsperiode: [Neste 3 måneder ▼]            │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 42 hendelser vil bli eksportert         │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [⬇ Last ned kalenderfil (.ics)]             │
│                                             │
│ ─────────── eller ───────────               │
│                                             │
│ 🔗 Automatisk synkronisering                │
│                                             │
│ Legg til denne URL-en i din kalenderapp     │
│ for automatiske oppdateringer:              │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ https://...functions.../calendar-feed   │ │
│ │ ?token=abc123...                   [📋] │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [🔄 Generer ny lenke]  [🗑️ Slett lenke]     │
│                                             │
│ Slik legger du til:                         │
│ • Google Calendar: Legg til kalender → URL  │
│ • iPhone: Innstillinger → Kalender → Kontoer│
│ • Outlook: Legg til kalender → Fra internett│
└─────────────────────────────────────────────┘
```

---

## Sikkerhet

### Token-sikkerhet
- Tokens er 64 tegn lange, kryptografisk tilfeldige (crypto.randomUUID() + crypto.randomUUID())
- Tokens er knyttet til company_id, ikke user_id for datahenting
- Tokens kan tilbakekalles av bruker når som helst
- Ingen sensitiv brukerdata eksponeres - kun hendelsesdata

### Data-isolasjon
- Edge function bruker service role for å hente data
- Spørringer filtreres eksplisitt på `company_id` fra tokenet
- Ingen måte å hente andre selskapers data selv med gyldig token

---

## Filer som opprettes/endres

| Fil | Endring |
|-----|---------|
| **Database** | Ny tabell `calendar_subscriptions` med RLS |
| `supabase/functions/calendar-feed/index.ts` | **NY** - Edge function for .ics-feed |
| `supabase/config.toml` | Legg til calendar-feed med verify_jwt=false |
| `src/components/dashboard/CalendarExportDialog.tsx` | Utvid med abonnementsseksjon |
| `src/integrations/supabase/types.ts` | Oppdateres automatisk |

---

## Edge function flow

```text
1. Kalenderapp (Google/Apple/Samsung)
   │
   ▼
2. GET https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/calendar-feed?token=xxx
   │
   ▼
3. Edge function validerer token
   │
   ├─ Ugyldig → 401 Unauthorized
   │
   └─ Gyldig → Hent company_id fra token
              │
              ▼
4. Hent data fra alle tabeller med WHERE company_id = ?
   │
   ▼
5. Generer ICS-innhold (gjenbruker logikk fra icsExport.ts)
   │
   ▼
6. Returner med headers:
   Content-Type: text/calendar; charset=utf-8
   Cache-Control: no-cache, no-store
```

---

## Forventet resultat

- Brukere kan generere en abonnementslenke med ett klikk
- Lenken kan legges til i alle standard kalenderapper
- Kalenderen oppdateres automatisk (avhenger av kalenderapp, typisk 15-60 min)
- Enkelt å tilbakekalle tilgang ved å slette tokenet
- Full dataisolasjon per selskap

