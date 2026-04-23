

# AI Course Generator — integrert i Opplæring-modulen

Bygger en AI-drevet kursgenerator som tar en operasjonsmanual (PDF) og produserer ferdige kurs i den **eksisterende** opplæringsmodulen (`training_courses` / `training_questions` / `training_question_options`). Ingen parallelle tabeller — alt havner i samme system slik at tildeling, gjennomføring, kompetanseregistrering og resultater fungerer som før.

## Brukerflyt

1. På Admin → Opplæring kommer en ny knapp **"Generer med AI"** (ved siden av "Nytt kurs" og "Ny mappe").
2. Dialog åpnes med tre steg:
   - **Steg 1 — Last opp manual**: Dra-og-slipp PDF (maks 50 MB). Lagres i `manuals`-bucket. Tekst trekkes ut i nettleseren med `pdfjs-dist` (samme bibliotek som allerede brukes i `TrainingCourseEditor`). Tekst chunkes (~1000 ord, foretrekker overskrifter) og sendes til edge function for embedding-lagring.
   - **Steg 2 — Konfigurer kurs**: Rolle (Pilot / Observatør / Administrator), Vanskelighetsgrad (Lett / Medium / Vanskelig), Antall spørsmål (5 / 10 / 20), Fokusområde (valgfri tekst), Mappe (valgfri — bruker eksisterende mapper).
   - **Steg 3 — Generer**: Kaller `generate-course` edge function. Viser progress. Når ferdig: kurset åpnes i den **eksisterende** `TrainingCourseEditor` slik at admin kan finpusse spørsmål, legge til bilder, justere bestågrense osv. før publisering.
3. Etter publisering brukes vanlig **TakeCourseDialog** for gjennomføring — score lagres i `training_assignments` og kompetanse i `personnel_competencies` som i dag.

## Database-endringer

Nye tabeller (eksisterende kurs-tabeller røres ikke):

- `manuals` — `id`, `company_id`, `title`, `file_url`, `file_size`, `page_count`, `uploaded_by`, `created_at`. RLS: bedrifts-isolert via `get_user_visible_company_ids`.
- `manual_chunks` — `id`, `manual_id`, `chunk_index`, `chunk_text`, `section_heading`, `embedding vector(1536)`, `token_count`. RLS: arvet via `manual_id`. GIN/IVFFlat-indeks på embedding.
- Ny kolonne `training_courses.source_manual_id uuid` (nullable, FK → manuals) for sporbarhet.
- Storage bucket `manuals` (privat). RLS: kun samme selskap kan lese/skrive sine egne PDF-er. Path-mønster: `{company_id}/{manual_id}.pdf`.
- pgvector-extension aktiveres (`create extension if not exists vector`).

## Edge functions

**`process-manual`** (kalt etter upload)
- Input: `manual_id`, `chunks: [{ index, text, heading }]`
- Genererer embeddings via Lovable AI Gateway (`google/text-embedding-004` eller OpenAI embedding) i batcher på 20.
- Insert i `manual_chunks`. Returnerer `{ chunk_count }`.

**`generate-course`**
- Input: `manual_id`, `role`, `difficulty`, `length`, `focus_area`, `folder_id`.
- Henter relevante chunks: hvis `focus_area` finnes → embed query → top-K via pgvector cosine similarity (K = 8–12). Ellers → diversifisert utvalg (jevnt fordelt på `chunk_index`).
- Sender til Lovable AI (`google/gemini-2.5-pro`) med strukturert output via tool-calling (ikke fri JSON) for garantert gyldig schema. System-prompt og bruker-prompt nøyaktig som spesifisert (norsk-tilpasset for AviSafe), med eksplisitt regel: "Bruk kun gitt innhold, ikke finn på."
- Mapper AI-output til eksisterende skjema:
  - `multiple_choice` → `training_questions.slide_type='question'` + `training_question_options` (én markert `is_correct=true`)
  - `scenario` → `training_questions.slide_type='question'` med scenariet flettet inn i `question_text` og forklaring i `content_json.explanation`. `source_reference` lagres i `content_json.source_reference`.
- Oppretter `training_courses`-rad med `status='draft'`, `source_manual_id`, valgt `folder_id`, `passing_score=80`, `validity_months=12`.
- Returnerer `course_id`. Frontend åpner deretter `TrainingCourseEditor` med kurset.

Alle funksjoner: CORS-headere, JWT-validering i kode, 429/402-håndtering med toast på klient.

## Frontend-komponenter

- `src/components/training/AICourseGeneratorDialog.tsx` — 3-stegs wizard (upload → config → generate).
- `src/components/training/ManualUploadStep.tsx` — drag/drop + pdfjs tekstuttrekk + chunking-logikk.
- `src/components/training/CourseConfigStep.tsx` — skjema med rolle/vanskelighet/lengde/fokus/mappe.
- `src/lib/manualChunker.ts` — splitt på `\n\n[A-Z0-9.]+ ` (overskriftsmønster), fallback ord-vindu 1000 med 100 overlap.
- `TrainingSection.tsx`: ny knapp "Generer med AI" + state for å åpne dialogen + flow som åpner `TrainingCourseEditor` med returnert `course_id`.
- Eksisterende kort-visning, badges, mappestruktur, deling oppover/nedover, gjennomføring og resultater fungerer uendret.

## UX-detaljer

- Mørkt tema, glassmorfisme — matcher resten av appen.
- Wizard som `Dialog` (mobil: full sheet), kortbasert layout.
- Progress-indikator under generering ("Analyserer manual…", "Genererer spørsmål…", "Lagrer kurs…").
- "Regenerer spørsmål"-knapp inne i editor (Phase 2 — valgfri, lagt inn som disabled placeholder).
- Tydelig melding hvis bestemt seksjon mangler innhold: AI hopper over og UI viser "X spørsmål generert (av Y forespurt)".
- Sporbarhet: hvert spørsmål viser liten badge "Kilde: Seksjon 3.2" i editor og kan vises under gjennomføring i forklaringen.

## Tekniske detaljer

- **Embedding-modell**: `text-embedding-3-small` via OpenAI hvis `OPENAI_API_KEY` finnes (best kvalitet). Fallback til Lovable AI Gateway hvis ikke. Brukeren spørres ikke — vi bruker det som er konfigurert (sjekkes i edge function).
- **Generering**: `google/gemini-2.5-pro` for kvalitet på lange kontekster. Tool-calling for strukturert output.
- **PDF-størrelse**: tekst trekkes ut klient-side for å spare edge-tid; kun tekst-chunks sendes til server.
- **Sikkerhet**: kun admin-rolle kan generere kurs (sjekk via `useRoleCheck`). Edge function validerer at `manual_id` tilhører kallende brukers selskap.
- **Feilhåndtering**: Toast på 429 (rate limit), 402 (kreditt), nettverksfeil. Hvis AI returnerer ugyldig schema → retry én gang, deretter feilmelding.

## Endrede filer

- Nye: `AICourseGeneratorDialog.tsx`, `ManualUploadStep.tsx`, `CourseConfigStep.tsx`, `manualChunker.ts`, edge functions `process-manual/index.ts` og `generate-course/index.ts`.
- Endret: `src/components/admin/TrainingSection.tsx` (knapp + state).
- Migrasjon: `manuals`, `manual_chunks`, `source_manual_id`-kolonne, RLS-policyer, storage bucket + policyer, pgvector-extension.
- `supabase/config.toml`: registrer to nye edge functions.

