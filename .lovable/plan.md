## Mål
Gi superadmin på `/statistikk` en knapp "Behandle med AI" som leverer en lederrettet analyse: trender, røde flagg, anbefalt fokus (opplæring, kurs, prosess), og prioriterte tiltak. Resultatet vises i en ekspanderbar seksjon øverst på siden.

## Endringer

### 1. Ny edge function: `supabase/functions/platform-statistics-ai/index.ts`
- `verify_jwt = true`, superadmin-sjekk via `user_roles`.
- Input: `{ exclude_avisafe: boolean }`.
- Henter samme aggregater som `platform-statistics` (gjenbruker dataformen som frontend allerede mottar), pluss:
  - Topp 10 nyeste hendelser (alvorlighet, kategori, beskrivelse uten PII, dato, selskap-tag hvis ikke ekskludert).
  - Avvik fra `mission_deviation_reports` siste 6 mnd (kategori, antall pr kategori, trend siste 3 mnd vs forrige 3 mnd).
- Kaller Lovable AI Gateway (`google/gemini-3-flash-preview`, streaming SSE) med systemprompt på norsk:
  - Rolle: "Sikkerhets- og driftsanalytiker for droneoperasjon".
  - Krav: Identifiser trender (opp/ned), risikoområder, sammenhenger (f.eks. høy hendelsesfrekvens i selskap med lav checklist-rate), og foreslå konkrete tiltak (opplæring, kurs, sjekkliste-forbedring, utstyrsbytte) prioritert som Høy/Medium/Lav.
  - Format: Kort sammendrag (3-4 setninger) + seksjoner: "Trender", "Risikoområder", "Anbefalt fokus", "Konkrete tiltak".
- Returnerer SSE-stream direkte til klient. Håndterer 429/402 med klare feilmeldinger.

### 2. UI-endringer i `src/pages/Statistikk.tsx`
- Ny knapp "Behandle med AI" (Sparkles-ikon) i headeren ved siden av "Ekskluder Avisafe"-toggle.
- Ved klikk:
  - Toggler en ny `<Collapsible>` rett under headeren (over PlatformActivityLog).
  - Trigger streaming-kall til `platform-statistics-ai` første gang den åpnes (eller via "Generer på nytt"-knapp).
  - Viser token-for-token tekst i en `GlassCard` med markdown-rendering (gjenbruk eksisterende lettvekts-renderer om finnes, ellers enkel `whitespace-pre-wrap`).
  - Loading-spinner mens første token mangler; viser feilmelding ved 429/402.
- Knappen er disabled mens stream pågår.

### 3. `supabase/config.toml`
- Legg til `[functions.platform-statistics-ai] verify_jwt = true`.

## Tekniske detaljer
- Ingen DB-migrasjoner.
- Ingen nye secrets (LOVABLE_API_KEY er auto-provisjonert).
- Bruker `streamChat`-mønster fra AI Gateway-knowledge (line-by-line SSE-parsing).
- All data som sendes til AI er aggregert/anonymisert — ingen personnavn eller fritekst med PII.

## Verifisering
- Logg inn som Avisafe superadmin, åpne `/statistikk`, klikk "Behandle med AI", bekreft at analysen streames inn og at seksjonen kan kollapses/åpnes på nytt uten å re-trigge kallet.
- Test toggle "Ekskluder Avisafe" påvirker datagrunnlaget AI får.
