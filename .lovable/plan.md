# Deling i «Ny sjekkliste»-dialogen

Når man oppretter en sjekkliste finnes det i dag bare en global-bryter (kun superadmin). Redigeringsdialogen for dokumenter/sjekklister har en full «Synlighet og deling»-seksjon. Denne skal gjenbrukes i opprettelsesdialogen.

## Hva som bygges

I dialogen «Ny sjekkliste», under punktene og før knappene, legges en sammenleggbar seksjon «Synlighet og deling» — identisk oppsett som i redigeringsdialogen:

- Global synlighet (bryter, kun superadmin) — sjekklisten blir synlig for alle selskaper.
- Synlig for underavdelinger (bryter, kun når selskapet har underavdelinger).
- Del med spesifikke avdelinger — søkbar avkryssingsliste over andre selskaper, skjult når global synlighet er på.

Seksjonen er lukket som standard, slik at dialogen ser like enkel ut som i dag for de som bare vil lage en liste raskt.

Ved lagring opprettes sjekklisten med valgt synlighet, og de valgte avdelingene lagres som delingsrader — slik at nyopprettede sjekklister får riktig delingsstatus umiddelbart (samme «Delt»-badge i listen som for dokumenter).

## Teknisk

Fil: `src/components/documents/CreateChecklistDialog.tsx`

- Gjenbruk mønsteret fra `DocumentCardModal.tsx` (linje 139–197 og 429–449): hent `companies` (alle unntatt eget) for avdelingslisten, sjekk om eget selskap er parent (`parent_company_id = companyId`), og bruk `DepartmentChecklist` + `Collapsible` for UI.
- Insert i `documents` utvides med `visible_to_children` og `global_visibility`, med `.select("id").single()` for å få ny id.
- Etter insert: `upsert` valgte avdelinger i `document_department_visibility` (`document_id`, `company_id`).
- Nye i18n-nøkler er ikke nødvendige for delingsseksjonen — gjenbruk eksisterende `documents.cardModal.*`-nøkler (`visibilitySectionTitle`, `globalVisibilityLabel/Description`, `visibleToChildrenLabel/Description`, `sharedDepartmentsLabel`, `selectAllDepartments`) i både no.json og en.json.
- Alle skjemafelter nullstilles ved lukking som i dag.
