

## Marketing-modul forbedringer

### Nåværende tilstand
- Utkast-listen viser alle utkast i en flat liste med små ghost-knapper for redigering
- Publisering skjer kun fra inne i DraftEditorDialog
- DB har allerede `scheduled_at` og `published_at` kolonner, men de brukes ikke i UI
- Ingen scheduler-funksjonalitet

### Plan

#### 1. Forbedret utkast-liste med publiseringsknapp og kø-visning

Oppdater `MarketingDrafts.tsx`:
- Legg til faner øverst: **Alle** | **Klare til publisering** (status=approved) | **Planlagt** | **Publisert**
- For utkast med status "approved": Vis en tydelig blå **"Publiser"**-knapp direkte i kortet (ikke bare inne i editoren)
- For planlagte poster: Vis planlagt dato/klokkeslett
- For publiserte poster: Vis publiseringstidspunkt og lenke til Facebook-innlegget

#### 2. Scheduler i DraftEditorDialog

Oppdater `DraftEditorDialog.tsx`:
- Legg til et nytt "Planlegg publisering"-felt med dato- og tidsvelger (Popover + Calendar + klokkeslett-input)
- Ny status "scheduled" som settes når bruker velger dato/tid
- Lagre valgt tidspunkt i `scheduled_at`-kolonnen
- Vis knapp "Planlegg" ved siden av "Publiser til Facebook"

#### 3. Cron Edge Function for planlagt publisering

Opprett `supabase/functions/publish-scheduled/index.ts`:
- Kjører periodisk via pg_cron (hvert 5. minutt)
- Henter alle drafts der `status = 'scheduled'` og `scheduled_at <= now()`
- Kaller Facebook Graph API for hver (med samme logikk som publish-facebook)
- Oppdaterer status til "published" og setter `published_at`
- Logger feil per draft

#### 4. Oversikt-forbedring

Oppdater `MarketingOverview.tsx`:
- Legg til en "Neste planlagte" seksjon som viser de neste 3 planlagte postene med nedtelling
- Legg til "Nylig publisert" seksjon med de siste 3 publiserte postene

### Tekniske detaljer

**Filer som endres:**
- `src/components/marketing/MarketingDrafts.tsx` — faner og publiseringsknapp i liste
- `src/components/marketing/DraftEditorDialog.tsx` — scheduler UI med dato/tid-velger
- `src/components/marketing/MarketingOverview.tsx` — neste planlagte og nylig publisert
- `supabase/functions/publish-scheduled/index.ts` — ny cron-funksjon
- `supabase/config.toml` — registrer ny funksjon med `verify_jwt = false`

**Cron-jobb:** SQL via insert-tool for å sette opp pg_cron som kaller publish-scheduled hvert 5. minutt.

**Ingen DB-migrasjoner nødvendig** — `scheduled_at` og `published_at` finnes allerede.

