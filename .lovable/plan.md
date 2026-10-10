# Internrevisjon runde A: tydelig lagring, bedre funnflyt og lukking

Bare fanen «Internrevisjon» endres. Andre faner, compliance-motoren og purringer røres ikke.

## Steg 0: SQL vises først, ingenting kjøres
- Jeg leser gjeldende definisjon av `audit_findings_guard` og `audit_reviews_guard` (bare lesing) og skriver migrasjonen som `CREATE OR REPLACE` på dem, slik at dagens regler beholdes.
- Full migrasjon og full test-SQL vises i chatten. Deretter STOPPER jeg. Ingenting kjøres før du har godkjent i et eget svar.

## Steg 1: Migrasjon (idempotent)
- `audit_findings.checklist_item_id` (uuid, kan være tom, peker på sjekklistepunktet, settes til tom hvis punktet slettes). Unik delindeks: ett funn per punkt.
- `audit_findings_guard`: `checklist_item_id` kan ikke endres etter at funnet er opprettet.
- Ny trigger etter endring av result/comment på sjekklistepunkter (SECURITY DEFINER, search_path=public, REVOKE EXECUTE fra PUBLIC/anon/authenticated): en planlagt revisjon settes til «in_progress».
- `audit_reviews_guard` ved lukking, i tillegg til regelen om kritiske funn:
  - avvis hvis noen punkter har result 'unknown' («X punkter er ikke vurdert»)
  - avvis hvis punkter med 'warn'/'fail' mangler kommentar («X punkter med avvik mangler begrunnelse»)
  - override_reason opphever ikke disse to reglene.

## Steg 2: Test-SQL (kjøres bare etter godkjenning, alt rulles tilbake)
- Et nytt funn på et punkt som allerede har funn avvises.
- Første resultat på et punkt setter revisjonen til in_progress.
- Lukking avvises når punkter ikke er vurdert, og når avvik mangler begrunnelse, også med override_reason.
- Blokken avsluttes med `RAISE EXCEPTION 'TESTRESULTAT: %', out;` uten ytre exception-handler.

## Steg 3: Frontend (`AuditDetailDialog` og nye små komponenter)
- **Lagringslinje** øverst, utenfor scrolleren: «Endringer lagres automatisk» + «Lagrer…» / «Lagret kl. HH:MM» / «Kunne ikke lagre – prøv igjen» (rødt). Status hentes fra et felles lagringsstatus-objekt i `useInternalAuditMutations`.
- **Lukking av dialogen**: aktivt felt blurres, og dialogen venter til pågående lagring er ferdig før den lukkes.
- **Faner**: Sjekkliste | Funn (antall) | Oppsummering. Fanelisten ligger utenfor scrolleren, innholdet i den ene scrolleren med `[touch-action:pan-y]`.
- **Sjekkliste**: knappene Bestått / Delvis / merknad / Ikke bestått / Ikke relevant. Ved Delvis/Ikke bestått heter kommentarfeltet «Begrunnelse (påkrevd)», og «Lag funn» vises. Har punktet allerede et funn, vises «Funn opprettet» + «Gå til funn» (bytter fane, scroller til funnet og markerer det kort).
- **Ny dialog `NewFindingDialog`** (fra punkt og fra «Legg til funn»): beskrivelse (forhåndsutfylt med punkt og kommentar), nivå (Nivå 1 (kritisk) / Nivå 2 / Observasjon), ansvarlig (forslag: revisjonens ansvarlige), frist (foreslått fra nivået til brukeren endrer den selv). Forhåndsvalg: Ikke bestått → Nivå 2, Delvis → Observasjon. Knappen er deaktivert mens lagring pågår. Toast «Funn opprettet» med «Vis».
- **Funn-fanen**: Nivå 1 først, deretter frist. Statusene Åpen / Tiltak pågår / Klar for verifisering (beregnet) / Lukket (verifisert) (også for gamle 'closed'). 'closed' fjernes fra nedtrekkslisten. Nytt tiltak arver ansvarlig og frist fra funnet. «Verifiser og lukk» vises bare for admin når funnet er klart, krever bekreftelse, setter 'verified' og har hjelpeteksten «Bekreft at tiltakene er gjennomført og har virket.»
- **Oppsummering-fanen**: vurderte punkter per seksjon (f.eks. 3/4), funn per nivå, åpne funn. Liste over det som hindrer lukking, med lenke til punktet eller funnet. «Lukk revisjon» flyttes hit. Feltet for overstyringsbegrunnelse vises bare når åpne Nivå 1-funn er det eneste hinderet.
- **Bunnlinjen**: bare «Slett» (planlagte revisjoner) og «Lukk».
- Dialoglayout følger AGENTS.md: vh før dvh, `.dialog-max-h`, header/faner/knapper utenfor scrolleren.
- Alle nye tekster i både no.json og en.json.

## Steg 4: Tester
- Rene hjelpefunksjoner i `auditTemplates.ts` (eller ny `auditReviewLogic.ts`): `suggestDeadline(level, today)`, `findingDisplayStatus(finding)`, `closeBlockers(review)`.
- Enhetstester i `tests/`: frist per nivå (+7 / +60 / ingen), «Klar for verifisering» (uten tiltak / med åpent tiltak / bare lukkede tiltak), og hinderlisten (ikke vurdert, avvik uten begrunnelse, åpne Nivå 1-funn, og at overstyring bare tilbys når kritiske funn er eneste hinder).
- Typesjekk og eksisterende audit-tester skal fortsatt bestå. AGENTS.md får én regel om at lukkeregler håndheves av serveren og vises med samme hjelpefunksjon i appen.

## Teknisk merknad
Ingen edge-funksjoner endres. Hinderlisten i appen speiler serverens regler. Det er serveren som avgjør.
