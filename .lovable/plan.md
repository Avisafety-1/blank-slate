## Mål

1. Når noen tagger en person med `@` i et oppdrag (merknader), opprettes det automatisk en meldingstråd (gruppesamtale) i innboksen mellom den som tagger og de taggede — med deeplink til oppdraget. E-postvarselet som sendes i dag beholdes.
2. Man kan reagere på meldinger med emoji (👍 osv.) ved å holde lenge inne (mobil) eller høyreklikke/klikke reaksjonsknapp (PC).

## Del 1 – Gruppesamtale ved @-tagging

Dagens flyt: `MissionNotesDialog.tsx` og `AddMissionDialog.tsx` finner taggede profiler og kaller `send-notification-email` (`notify_mission_mention`). Meldingstabellen `internal_messages` har allerede en ubrukt `deep_link`-kolonne, men `send-message`-funksjonen sender den ikke videre.

Endringer:
- `send-message` edge function: godta `deep_link` i payload og lagre den på meldingsraden (både ny tråd og svar).
- Ny delt hjelpefunksjon i frontend (f.eks. `src/lib/missionMentionThread.ts`):
  - Tar mission-id, tittel, merknadstekst og liste over taggede bruker-ID-er.
  - Slår opp om det allerede finnes en tråd for samme oppdrag (melding med `deep_link = /oppdrag?id=<mission_id>` der bruker er deltaker). Finnes den → send som svar (`parent_id`) i eksisterende tråd. Finnes den ikke → ny melding med alle taggede som mottakere.
  - Emne: oppdragstittel. Innhold: merknadsteksten + hvem som tagget.
  - `deep_link`: `/oppdrag?id=<mission_id>` (samme parameter `/oppdrag` allerede leser).
- Kall hjelperen fra `MissionNotesDialog.tsx` og `AddMissionDialog.tsx` rett etter dagens e-postutsending (e-post + push beholdes; push kommer automatisk via `send-message`).
- I innboksen (`InboxTab.tsx`): hvis tråden har `deep_link`, vis en knapp «Åpne oppdrag» øverst i tråden som navigerer dit og lukker profildialogen.
- `useMessageThread`/`useInboxMessages` henter med `deep_link`-feltet.

## Del 2 – Emoji-reaksjoner

Database (migrasjon):
- Ny tabell `internal_message_reactions` (`id`, `message_id` → `internal_messages`, `user_id`, `emoji`, `created_at`, unik på (message_id, user_id, emoji)).
- GRANT til `authenticated`/`service_role`, RLS på:
  - SELECT/INSERT/DELETE kun for brukere som har tilgang til meldingen (gjenbruk eksisterende `can_access_message`-funksjon), og DELETE/INSERT kun for egne rader (`auth.uid() = user_id`).

Frontend:
- Ny hook `useMessageReactions(threadRootId)`: henter reaksjoner for alle meldinger i tråden, og mutasjon for å toggle en emoji.
- I `InboxTab.tsx` meldingsboble:
  - Langtrykk (~500 ms touch) eller høyreklikk åpner en liten emoji-rad: 👍 ❤️ 😂 🎉 ✅ ❓.
  - Valgt emoji toggles av/på for innlogget bruker.
  - Under bobla vises samlede reaksjoner som små pilletegn med antall; egen reaksjon markeres.
- Realtime/refetch: invalidér reaksjonsspørringen ved endring så begge parter ser oppdatering.

## Teknisk / i18n

- Alle nye brukervendte tekster («Åpne oppdrag», «Reager», tooltips) legges i både `no.json` og `en.json`.
- Ingen endringer i eksisterende e-postvarsling eller RLS for `internal_messages`.
