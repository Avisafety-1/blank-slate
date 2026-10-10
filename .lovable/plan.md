# Innboks: åpne og behandle saken uten å forlate innboksen

Ingen databaseendringer eller nye tilganger. Eksisterende tilgangsregler og dialoger bestemmer om innhold kan redigeres; ellers vises det i lesemodus.

## Endelig handlingsliste per kode

| Kode | Handlinger i innboks og e-post | Type og relevans |
|---|---|---|
| `MissionPlannedPastDue` | Ble ikke fløyet, Ble fløyet, Endre dato | Beholdes uendret. De to første endrer data og krever bekreftelse; Endre dato åpner eksisterende oppdragsredigering. |
| `MissionInProgressStale` | Avslutt oppdraget, Ble ikke fløyet | Beholdes uendret; begge endrer data og krever bekreftelse. |
| `ActiveFlightStale` | Avslutt flygingen | Beholdes uendret; endrer data, krever bekreftelse og vises bare for piloten mens flygingen er aktiv. |
| `MissionWithoutFlightLog` | Last opp flylogg, Ble ikke fløyet | Beholdes uendret; opplasting åpner eksisterende dialog, statusendring krever bekreftelse. |
| `IncidentOpenTooLong` | Ta ansvar, Skriv kommentar, Lukk hendelse… | Ta ansvar og kommentar endrer data og krever bekreftelse; kommentaren lagres i eksisterende hendelseskommentarer. Lukk åpner hendelsesdialogens eksisterende statusskjema uten egen mutasjon. Skjules når hendelsen er lukket; Ta ansvar skjules når brukeren allerede er ansvarlig eller mangler rettighet. |
| `IncidentNoResponsible` | Ta ansvar, Velg ansvarlig… | Ta ansvar beholdes som bekreftet endring. Velg ansvarlig åpner hendelsesdialogen; kontrollen vises bare med eksisterende rettighet. Begge skjules når ansvarlig er satt eller hendelsen er lukket. |
| `OpenActionsTooLong` | Åpne tiltaket | Åpner `AuditTaskDialog` på funnet som tiltaket tilhører. Ingen direkte endring. Skjules når tiltaket er lukket. |
| `FindingAwaitingVerification` og øvrige `Audit*`-koder | Åpne revisjonsoppgave | Åpner `AuditTaskDialog`; ingen direkte endring. |
| `FlownWithNoGo` | Rapporter hendelse, Skriv forklaring | Første åpner eksisterende hendelsesskjema forhåndsutfylt med oppdraget. Forklaring bruker eksisterende oppdragsmerknad og krever bekreftelse før lagring. Handlingene følger eksisterende hendelses-/oppdragstilgang. |
| `MissingRiskAssessment` | Start risikovurdering / Åpne risikovurdering | Åpner oppdragets eksisterende risikovurderingsdialog. Teksten og startfanen bestemmes av om en vurdering allerede finnes. Skjules når mangelen er løst. |
| `SoraEnvelopeExceeded` | Åpne risikovurdering | Åpner eksisterende vurderingshistorikk/resultat for oppdraget; ingen direkte endring. Skjules når avviket ikke lenger finnes i aktuell vurdering. |
| `ExpiredCompetence`, `CompetenceExpiringSoon` | Oppdater kompetanse… | Åpner personens eksisterende kompetansedialog med den aktuelle raden i redigering når brukeren kan redigere; ellers samme dialog i lesemodus. Skjules når gyldigheten ikke lenger er utløpt/snart utløpt. |
| `ExpiredDocument`, `DocumentReviewOverdue` | Last opp ny versjon… | Åpner eksisterende dokumentredigering med dokumentet valgt; ny fil bruker dagens versjonsøkning. Skjules når dokumentet ikke lenger er utløpt/snart utløpt. **«Marker som gjennomgått» tas ikke med:** dokumentene har bare `gyldig_til` og varslingsdager, ikke et lagret gjennomgangsintervall som kan beregne korrekt ny dato uten databaseendring. |
| `MissingEmergencyPlan` | Last opp beredskapsplan… | Åpner eksisterende dokumentopplasting forhåndsutfylt med tittel «Beredskapsplan» og en eksisterende dokumentkategori; ingen ny kategori eller datamodell. Skjules når validatorens eksisterende søk finner en beredskapsplan. |
| `DroneStatusRed`, `DroneStatusYellow` | Registrer inspeksjon/vedlikehold… | Åpner eksisterende dronedetalj og ruller/fokuserer til vedlikeholds-/inspeksjonsdelen. Eksisterende begrensning for teknisk ansvarlig avgjør om handlingen kan utføres; ellers er visningen lesbar. Skjules når dronens beregnede status er grønn. |

For alle gyldige `finding_key`-entiteter vises i tillegg en kort, entitetsspesifikk åpneknapp: «Åpne hendelse/oppdrag/dokument/drone/person» eller «Åpne revisjonsoppgave». Samlepurringer får én knapp per entitet med kort navn. Dette er åpnehandlinger og utfører aldri en endring.

## 1. Dialoger over innboksen

- Flytt `AuditEntityDialogHost` fra bare revisjonsmodulen til det autentiserte app-skallet, og behold revisjonsmodulen som forbruker av samme globale vert.
- Utvid verten kontrollert med eksisterende dialoger og valgfrie startmål: hendelseslukking/ansvarlig, oppdragsrisiko/merknad/hendelsesrapport, kompetanserad, dokumentredigering/-opplasting og dronevedlikehold.
- La `audit_finding` og `audit_action` åpne `AuditTaskDialog` uten navigasjon; for `audit_action` slås tilhørende `finding_id` opp først.
- Detaljdialogen legges over innboksens `Sheet`, mens innboksen og valgt tråd forblir montert bak. Fokus, scroll-lås, `vh`/`dvh`-fallback og touch-scroll følger eksisterende mobil-/DJI-mønstre.
- Når detaljdialogen lukkes, invalideres `['inbox']`, tråd/ulest-teller og `['audit']`, og saken lastes på nytt før knapper/prompt oppdateres.

## 2. Meldingsdetalj og ferdigmarkering

- Parse alle nøkler med `parseFindingKeys`, hent kort entitetsnavn, og vis åpneknapp for hver entitet som kan åpnes. Hurtighandlinger vises separat under riktig entitet.
- Fjern «Gå til modul». Bare gamle meldinger uten `finding_key`, men med `deep_link`, får en generell «Åpne»-knapp med dagens navigasjon.
- Etter lukking eller en handling kjøres `availableActions` mot fersk tilstand. Når ingen relevante handlinger gjenstår, vises «Saken ser løst ut – marker som ferdig?» og «Marker som ferdig». Meldingen markeres aldri ferdig automatisk.
- For samlepurringer vurderes alle entiteter; ferdigprompten vises først når ingen av dem har relevante handlinger.

## 3. Felles handlingsregister

- Utvid `_shared/reminderActions.ts` til én deklarativ definisjon per kode med `kind: 'open' | 'mutate'`, etiketter, dialogmål/deep-link og statskrav.
- `availableActions` mottar fersk entitetsstatus og bruker eksisterende tilgangssignaler, slik at løste eller utilgjengelige handlinger skjules. Databasens eksisterende tilgangsregler er fortsatt siste kontroll ved alle skriverier.
- `ReminderActionCard` utfører bare endrehandlinger etter bekreftelsesdialog og legger deretter svar i tråden som i dag. Åpnehandlinger åpner riktig eksisterende dialog direkte, uten bekreftelse.
- E-post genereres fra samme register. Knappene er alltid vanlige app-lenker med melding, entitet og ønsket åpnehandling; e-post utfører aldri en handling. Appen kontrollerer aktuell tilstand og tilgang når lenken åpnes.

## 4. Små tilpasninger i eksisterende dialoger

- Legg til valgfrie startparametere, uten å endre datamodellene: valgt hendelseshandling, risikovurderingsfane, valgt kompetanserad, dokumentmodus/forhåndsutfylling og vedlikeholdsanker.
- Gjenbruk eksisterende mutasjoner og skjemaer. Der dagens detaljdialog allerede skjuler redigering etter rolle/eierskap, beholdes dette; ingen klientkontroll erstatter serverens tilgangskontroll.
- Mission-merknaden og andre berørte, hardkodede tekster som røres flyttes samtidig til `no.json` og `en.json`; alle nye tekster legges i begge språkfiler.

## 5. Regler og tester

- Oppdater `AGENTS.md`: åpnehandlinger åpner eksisterende dialog/skjema uten bekreftelse eller dataskrivning; endrehandlinger krever bekreftelse og trådsvar; e-post inneholder bare lenker til samme handlinger.
- Utvid enhetstestene med nøyaktig handlingsliste for hver kode over, relevante/løste tilstander og tilgangsfiltrering.
- Test at alle endrehandlinger går gjennom bekreftelse, mens åpnehandlinger ikke gjør det.
- Test at innboks og e-post bygges fra samme register og gir samme handlings-ID-er, og at e-postlenker aldri muterer data.
- Test parsing/samlepurringer, én åpneknapp per entitet, audit_action→finding-oppslag og manuell ferdigprompt.
- Kjør prosjektets tester, `npx tsgo --noEmit -p tsconfig.app.json` og `git diff --check`.
- Fordi `_shared/reminderActions.ts` endres, kjør `deno check --node-modules-dir=auto` på `supabase/functions/send-reminder/index.ts`. Søk importgrafen på nytt etter endringen og kjør samme kontroll på eventuelle andre berørte `index.ts`.
- Verifiser i innlogget forhåndsvisning på desktop og mobil størrelse: dialog over innboks, bakgrunn bevart, nested fokus/scroll, lys/mørk modus og ferdigprompt etter en reelt løst sak.

## Tekniske avgrensninger

- Ingen SQL, migrasjon, nye tabeller/kolonner, nye roller eller utvidede tilganger.
- Compliance-validatorene, eksisterende purringer og `send-reminder` sin mottaker-/sendelogikk endres ikke; bare felles handlingsmetadata og e-postknappene utvides.
- Hvis implementeringen likevel avdekker et ufravikelig SQL-behov, vises full SQL og arbeidet stopper før noe kjøres.
