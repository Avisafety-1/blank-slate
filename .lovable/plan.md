# Internrevisjon runde B1: årsak, tiltaksplan og «Mine revisjonsoppgaver»

Ingen varsling, ingen endring i compliance-motoren eller purringer.

## Steg 0 – SQL (vises i chatten, kjøres først etter eget godkjenningssvar)

Jeg skriver full migrasjon og full test-SQL i chatten og stopper.

**Migrasjon (idempotent)**
- `audit_findings.root_cause text NULL` (`ADD COLUMN IF NOT EXISTS`).
- `audit_findings_guard` (`CREATE OR REPLACE`, resten uendret):
  - Låsen for ikke-admin får `root_cause` i unntakslisten, men bare når brukeren er `responsible_user_id` på funnet. Feilmelding: «Som ansvarlig kan du bare endre status og årsak på funnet».
  - `root_cause` låst når `OLD.status = 'verified'` og status står fast: «Årsaken kan ikke endres etter verifisering. Gjenåpne funnet først».
- Ny hjelper `is_audit_finding_responsible(_finding_id)` (SECURITY DEFINER, `search_path=public`, REVOKE fra PUBLIC/anon, GRANT kun authenticated fordi policyene bruker den).
- `audit_actions`-policyer (DROP IF EXISTS + CREATE):
  - INSERT: eieradmin ELLER funnansvarlig på funn som ikke er `verified`/`closed`.
  - UPDATE: eieradmin ELLER tiltaksansvarlig ELLER funnansvarlig (samme i USING og WITH CHECK).
  - DELETE: eieradmin ELLER (funnansvarlig OG `status='open'` OG `created_by = auth.uid()`).
- `audit_actions_guard` utvides med én regel per rolle:
  - Admin i eierselskapet: alt som før.
  - INSERT som funnansvarlig: avvises hvis funnet er verifisert/lukket («Funnet er lukket – nye tiltak kan ikke legges til»).
  - UPDATE som funnansvarlig: kan endre `description`, `responsible_user_id`, `deadline` (pluss status/kommentar hvis også tiltaksansvarlig) så lenge tiltaket ikke er `closed` («Lukkede tiltak kan ikke endres»).
  - UPDATE som tiltaksansvarlig: bare status og kommentar (dagens melding).
  - DELETE-sjekk speiles i en BEFORE DELETE-del med norsk melding.
  - Samme jsonb-sammenligning (`to_jsonb(NEW) - ARRAY[...]`) som i dag.

**Test-SQL** (bare `navn = 'Moderavdeling'`, to admins + én bruker uten admin-rolle, ellers `RAISE EXCEPTION 'Testoppsett: …'`; slutter med `RAISE EXCEPTION 'TESTRESULTAT: %', out;`, ingen ytre handler):
1. Ansvarlig bruker skriver `root_cause` på eget funn.
2. Ansvarlig oppretter tiltak på eget funn.
3. Ansvarlig avvises ved tiltak på andres funn.
4. Ansvarlig avvises ved endring av severity og deadline på funnet.
5. Tiltaksansvarlig lukker sitt tiltak, men avvises ved endring av frist.
6. `root_cause` låst etter verifisering.
7. Funnansvarlig sletter eget åpent tiltak; avvises på tiltak opprettet av admin.

## Steg 1 – Innboks: «Mine revisjonsoppgaver»
- Øverst i innboksen, en sammenleggbar seksjon som bare vises når brukeren har åpne funn eller tiltak. Leses direkte fra funn og tiltak.
- Rad: nivåmerke, Funn/Tiltak, kort beskrivelse, revisjonstittel, frist (rød når passert, gul innen 7 dager).
- Sortering: forfalte først, så Nivå 1, så frist.
- Tellingen på Innboks-merket i menyen = uleste tråder + åpne revisjonsoppgaver (egen query-nøkkel, invalideres etter alle revisjonsendringer).

## Steg 2 – Ny oppgavedialog
- Åpnes fra raden eller med `?auditFinding=<id>` hvor som helst i appen (global vert som fjerner parameteren ved lukking).
- Viser revisjon, revidert enhet, punkt og referanse, beskrivelse, nivå, frist og status (skrivebeskyttet for ikke-admin).
- Funnansvarlig: felt «Årsak (hvorfor oppsto avviket?)» og tiltaksliste (legg til med arvet frist, endre åpne, slette egne åpne).
- Tiltaksansvarlig: status, kommentar og «Marker som utført».
- Når alle tiltak er lukket: «Klar for verifisering – revisor kontrollerer og lukker funnet.»
- Samme lagringsstatus og «vent på lagring før lukking» som revisjonsdialogen.
- Lenker for funn og tiltak i revisjonsmodulen peker til denne dialogen (tiltak → funnet det tilhører).
- Revisjonsdialogen for admin viser årsaken under funnet.

## Steg 3 – Generelt
- Dialog etter prosjektreglene: vh før dvh, én scroller med `[touch-action:pan-y]`, header/knapper utenfor, fungerer med tastatur på iOS/Android/DJI RC Pro.
- Alle tekster i no.json og en.json.

## Tekniske detaljer
- Ny ren modul `audit/lib/auditTasks.ts`: `selectMyAuditTasks(findings, actions, userId)`, `sortAuditTasks`, `deadlineTone(deadline, today) → "overdue" | "soon" | "normal"`. Enhetstester i `tests/auditTasks.test.ts` (utvalg: ikke verifisert/lukket, både funn- og tiltaksansvar; sortering; fargegrenser ved 0 og 7 dager).
- Hook `useMyAuditTasks` med nøkkel `["audit","myTasks",userId]`; `useInvalidate` i `useInternalAudits.ts` får med `"myTasks"`. `useUnreadMessagesCount` brukes uendret; summen gjøres der merket tegnes.
- Mutasjoner for årsak/tiltak gjenbruker `useInternalAuditMutations` (`createAction` utvides med valgfri beskrivelse/ansvarlig/frist).
- `AuditTaskHost` monteres én gang i app-skallet og leser `auditFinding` fra URL.
- `auditDeepLink("audit_finding"|"audit_action")` → `?auditFinding=<findingId>`; validatoren sender funn-id for tiltak. `tests/auditDeepLink.test.ts` oppdateres.
- `FindingRow` får `root_cause`. Regel om ansvarsfordeling legges i `src/components/admin/audit/AGENTS.md`.
