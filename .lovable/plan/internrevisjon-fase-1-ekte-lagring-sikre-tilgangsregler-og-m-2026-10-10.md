# Internrevisjon fase 1: ekte lagring, sikre tilgangsregler og maler

Fanen «Internrevisjon» lagrer revisjoner, punkter, funn og tiltak i databasen i stedet for midlertidig minne. Andre faner, compliance-motoren og purringer endres ikke.

## Steg 0: Kontroll før endring
- Les dagens kolonner, policyer, triggere og eksisterende rader i `audit_reviews`, `audit_sections`, `audit_checklist_items`, `audit_findings`, `audit_actions`. Navnene på policyene som erstattes noteres og rapporteres i svaret.
- Sjekk at `fetchAuditReviews`, `get_user_company_id` og `get_user_visible_company_ids` har signaturene som planen forutsetter. Hvis noe avviker, justerer jeg migrasjonen og sier fra før den kjøres.

## Steg 1: Migrasjon (idempotent, godkjennes i chatten før kjøring)
- `audit_reviews`: `audited_company_id` (FK companies, backfill = company_id, deretter NOT NULL), `template_key` ('open'|'specific'|'luc', standard 'specific') og `reopen_reason text`.
- `audit_checklist_items`: `item_key`, `reference`.
- Policyer: DROP POLICY IF EXISTS på alle eksisterende policyer på de fem tabellene, og nye policyer nøyaktig som beskrevet (lesing via synlige selskap og revidert enhet; skriving for admin/administrator/superadmin i eierselskapet; UPDATE har samme vilkår i USING og WITH CHECK; ansvarlig person kan oppdatere egne funn og tiltak).
- Hjelpefunksjon `is_audit_owner_admin(review_id, company_id)` (SECURITY DEFINER, search_path=public, REVOKE fra PUBLIC/anon, GRANT kun til authenticated fordi RLS bruker den). Når review_id er satt: admin i selskapet som eier revisjonen. Når review_id er NULL (compliance-funn fra `useCreateAuditFinding` med source_scanner_code): admin/administrator/superadmin og funnets egen company_id i `get_user_visible_company_ids(auth.uid())`.
- Funn uten revisjon: policyene for audit_findings bruker samme regler basert på funnets egen company_id (lesing via synlige selskap; INSERT/DELETE for admin; UPDATE for admin eller ansvarlig). Tiltak arver reglene fra funnet sitt, også når funnet ikke har revisjon.
- Triggere (SECURITY DEFINER, search_path=public, REVOKE EXECUTE fra PUBLIC/anon/authenticated):
  - created_by = auth.uid() ved INSERT; company_id, review_id, finding_id og created_by er låst ved UPDATE.
  - Funn: company_id hentes fra revisjonens revidert enhet bare når review_id er satt; uten revisjon beholdes funnets company_id (kontrollert av policyen). Tiltak: company_id hentes alltid fra funnet sitt.
  - Tiltak: closed_by/closed_at settes ved 'closed' og nullstilles ved gjenåpning.
  - Funn: ikke-admin kan bare veksle mellom open/in_progress; verified/closed krever eier-admin; verified_by/verified_at settes av serveren; admin kan ikke verifisere når vedkommende selv er ansvarlig for funnet eller et tiltak (norsk feilmelding).
  - Kolonnebegrensning for ansvarlig: en ansvarlig som ikke er admin i eierselskapet (for funn uten revisjon: ikke admin i funnets selskap) kan på audit_findings bare endre status (open <-> in_progress), og på audit_actions bare status og comment. Endring av andre kolonner (description, category, severity, deadline, responsible_user_id, reference osv.) avvises med norsk feilmelding.
  - Revisjon: lukking avvises ved åpne kritiske funn, med mindre override_reason har minst 10 tegn; closed_at = now().
  - Standardverdi: BEFORE INSERT på audit_reviews setter audited_company_id = company_id når den er NULL (eksisterende `useCreateAuditReview` setter ikke feltet).
  - Lukket revisjon er låst: når status = 'closed' avvises INSERT/UPDATE/DELETE på audit_sections og audit_checklist_items for revisjonen, og endring av andre felt enn status på selve revisjonen. Gjenåpning (closed → in_progress) krever admin i eierselskapet og reopen_reason på minst 10 tegn; closed_at nullstilles. Funn og tiltak kan fortsatt følges opp etter lukking (status/verifisering).
  - Sletting: DELETE på audit_reviews tillates bare når status = 'planned' (både i policy og trigger).
- RPC `create_internal_audit(title, date, responsible, template_key, audited_company_id, sections jsonb)`, SECURITY INVOKER, slik at RLS gjelder og revisjon, seksjoner og punkter opprettes atomisk.
- Ingen eksisterende rader slettes; eneste dataendring er backfill av audited_company_id.

## Steg 2: Maler
- Ny `src/components/admin/audit/lib/auditTemplates.ts` med malene open, specific og luc (luc = alle seksjonene i specific + «Organisasjon og SMS»), med punktene og referansene slik du listet dem. Malen kopieres inn ved opprettelse (result 'unknown'), så senere malendringer ikke påvirker eksisterende revisjoner.
- Etiketter via i18n-nøkler; referanser vises som liten grå tekst.

## Steg 3: Frontend
- `InternalAuditsTab`: fjern mockdata; React Query via utvidet `fetchAuditReviews` (med seksjoner og punkter). Invalider revisjonsspørringen og KPI-ene etter hver endring.
- Dialogen «Ny revisjon»: tittel («Årlig internrevisjon {år}»), dato, ansvarlig (personvelger), mal (standard Spesifikk), revidert enhet (vises bare når selskapet har avdelinger).
- `AuditDetailDialog` skrives om til databasemodellen: resultatvalg per punkt (Bestått/Avvik/Ikke bestått/Ikke relevant) + kommentar; beregnet seksjonsstatus; «Lag funn» fra punkt (kategori = seksjon, referanse, alvorlighet forhåndsvalgt warning og kan endres til critical); funn/tiltak med personvelger, frist og status; «Verifiser» bare for admin; ved blokkert lukking vises varsel og felt for overstyringsbegrunnelse.
- Avdelingsbrukere ser bare lesbar visning, men kan oppdatere og lukke egne tiltak.
- Lukket revisjon vises skrivebeskyttet (funn og tiltak kan fortsatt følges opp), med knappen «Gjenåpne» for admin som åpner et felt for begrunnelse.
- Slett-knapp vises bare for planlagte revisjoner.
- Layout: `max-h-[90vh] max-h-[90dvh]`, én scroller med `[touch-action:pan-y]`, header og knapper utenfor, `.dialog-max-h` for tastatur.
- «Venter på verifisering»: validatoren `FindingAwaitingVerification` og `fetchFindingsAwaitingVerification` (queries/index.ts) endres til bare å telle funn med status 'in_progress' som har minst ett tiltak der alle tiltakene er 'closed'. Ingen andre deler av compliance-motoren endres.
- Alle nye tekster legges i både no.json og en.json.

## Steg 4: Test
- SQL-verifisering etter migrasjonen (i transaksjon med rollback, med simulert JWT): pilot kan ikke INSERT/DELETE i audit_reviews; admin kan ikke flytte company_id; klientens verified_by overskrives; funn uten revisjon kan opprettes av admin i eget selskap, men ikke av pilot eller for et selskap utenfor synlige selskap.
- Ansvarlig pilot forsøker å endre severity fra critical til info → avvist.
- Lukket revisjon: endring av sjekklistepunkt og av tittel avvises; gjenåpning uten begrunnelse (eller under 10 tegn) avvises; gjenåpning av admin med begrunnelse lykkes og nullstiller closed_at; funnstatus kan fortsatt endres.
- Sletting: planlagt revisjon kan slettes av admin; påbegynt og lukket revisjon avvises.
- Insert uten audited_company_id får company_id som revidert enhet.
- Enhetstest for ny «venter på verifisering»-regel: in_progress uten tiltak og med åpent tiltak telles ikke; med bare lukkede tiltak telles.
- Enhetstest `tests/auditTemplates.test.ts`: unike punkt-nøkler per mal, og luc inneholder alle seksjonene i specific.
- Typesjekk og eksisterende audit-tester skal fortsatt bestå. AGENTS.md får én regel om at malene kopieres ved opprettelse og at serveren setter eierskaps- og verifiseringsfelt.

## Teknisk merknad
Ingen edge-funksjoner endres. Mockfilen beholdes inntil videre fordi andre steder fortsatt kan importere typene.
