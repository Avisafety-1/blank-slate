## Oversetting og opprydning av profil-siden (ProfileDialog)

Alt gjøres i `src/components/ProfileDialog.tsx` + `src/components/SignaturePad.tsx` og i18n-filene `src/i18n/locales/en.json` / `no.json`. Ingen logikk endres.

### 1. Kortere tab-etiketter (så de får plass i knappene)

Legger til nye i18n-nøkler under `profile.tabs.*` og bruker disse i `TabsTrigger`:

| Tab | NO | EN |
| --- | --- | --- |
| profile | Profil | Profile |
| security | Sikkerhet | Security |
| competencies | Kompetanse | Skills |
| emergency | Nødkontakt | Emergency |
| notifications | Varsler | Alerts |
| incidents | Oppfølging | Follow-up |
| subscription | Abonnement | Plan |

Fjerner den nåværende `.replace('Min ', '')`-hacken på profil-tabben.

### 2. Rolle-badges (bilde 288)

Erstatter hardkodet norsk i badge-listen (linje ~1160-1197):
- «Godkjenner oppdrag (Alle avdelinger)» → `profile.roleBadges.approver` + `profile.roleBadges.allDepartments`
- «Oppfølgingsansvarlig hendelser» → `profile.roleBadges.incidentResponsible`
- «ECCAIRS-tilgang» → `profile.roleBadges.eccairs`
- «Teknisk ansvarlig» → `profile.roleBadges.technicalResponsible`

`formatScope()` bygges med `t()` i stedet for hardkodet ` (Alle avdelinger)`.

### 3. UAS operatørnummer-blokk (bilde 288)

- «UAS operatørnummer» → `profile.uasOperatorNumber`
- Placeholder «f.eks. NOR87…» → `profile.uasOperatorNumberPlaceholder`
- Hint «Fra Luftfartstilsynets flydrone-tjeneste…» → `profile.uasOperatorNumberHint`

### 4. Nødnumre-seksjon (Emergency-fanen)

- «Nødnumre», «Brann», «Politi», «Ambulanse» → `profile.emergencyNumbers`, `.fire`, `.police`, `.ambulance`

### 5. Signatur-seksjon (bilde 287)

I `SignaturePad.tsx` finnes allerede nøklene `profile.uploadSignature`, `profile.changeSignature`, `profile.drawSignature`, `profile.uploadingSignature`, `profile.signature`, men de mangler i `en.json`/`no.json` (bruker default-fallback). Legger til alle disse i begge språk:
- «Last opp signatur» / «Upload signature»
- «Endre signatur» / «Change signature»
- «Tegn signatur» / «Draw signature»
- «Laster opp…» / «Uploading…»
- «Signaturen brukes på eksporterte loggbøker og dokumenter.» / «This signature is used on exported logbooks and documents.» → `profile.signatureDescription`

### 6. Varslinger-fanen (bilde 289)

Alle hardkodede strenger fra linje ~1934-2062 flyttes til `profile.notificationOptions.*`:
- Oppdrag til godkjenning + beskrivelse (missionApproval / missionApprovalDesc)
- «Varslinger fra avdelinger» + beskrivelse (childCompanies / childCompaniesDesc)
- Nye hendelser / oppdrag / brukere / dokumenter / vedlikehold i avdelinger + tilhørende beskrivelser (childIncidents, childMissions, childNewUsers, childDocumentExpiry, childMaintenance)

### 7. Kompetanse-fanen

- «Opplæring og guider» + «Få en interaktiv gjennomgang…» → `profile.trainingAndGuides` + `profile.trainingAndGuidesDesc`
- «Kurs og tester» → `profile.coursesAndTests`
- «Kurs» (fallback tittel) → `profile.course`
- «⏳ Påbegynt» → `profile.inProgress`
- «Fortsett kurs» / «Ta kurs» → `profile.continueCourse` / `profile.takeCourse`
- «Utløpt» → `profile.expired`

### 8. Oppfølging-fanen (bilde 290)

- «Oppdrag til godkjenning ({{n}})» → `profile.pendingApprovalTitle`
- Badge «Sjekkliste», tekst «Risiko» → `profile.checklist`, `profile.risk`
- «Skriv kommentar…», «Send varsel til pilot», «Tilbake», «Godkjenn», «Avbryt», «Kommentar», «Kommentar (valgfritt)» → nøkler under `profile.approval.*`
- «Du er satt som flyger/personell…» → `profile.approval.selfBlocked`
- «Ingen oppdrag venter på godkjenning» → `profile.approval.noneWaiting`
- «Hendelser til oppfølging ({{n}})» → `profile.followUpIncidentsTitle`
- «Kommentar fra godkjenner {{name}}:» → `profile.approval.commentFrom`

### 9. Tilbakemelding-dialog (feedback)

Alle strenger (Gi tilbakemelding, Overskrift, Melding, Oppdrag (valgfritt), Vedlegg (valgfritt), Ingen, Søk oppdrag…, Ingen oppdrag funnet, Last flere, Laster…, Legg til bilde, Avbryt, Sender…, Send, «Tilbakemelding sendt!», «Fyll ut både overskrift og melding», «Bildet kan ikke være større enn 5 MB», «Kunne ikke sende tilbakemelding») → `profile.feedback.*`

### 10. Abonnement-fanen

- Overskrift «Abonnement» + «Se alle planer» → `profile.subscription.title`, `.seeAllPlans`
- Badges «Faktureres separat», «Prøveperiode», «Avsluttes», «Aktivt», «Nåværende», «Aktiv» → `.billedSeparately`, `.trial`, `.ending`, `.active`, `.current`, `.addonActive`
- «Ditt selskap faktureres separat…», «Sjekker abonnementstatus…», «Du har ikke et aktivt abonnement.», «Kontakt betalingsansvarlig…» → tilsvarende nøkler
- «Bytt plan», «Tilleggsmoduler», «Endring trer i kraft umiddelbart…», «Abonner nå», «Administrer abonnement», «X dager igjen av prøveperioden», «Utløper …», «Neste fornyelse», «Abonnementet avsluttes ved…», addons (SORA Admin, DJI-integrasjon, ECCAIRS-integrasjon, beskrivelser), confirm-tekst «Er du sikker på at du vil …» og toasts («Kunne ikke endre plan», «Plan endret til …», «X aktivert/deaktivert», «Kunne ikke oppdatere tilleggsmodul», «Kunne ikke åpne administrasjon», «Kunne ikke starte betaling») → `profile.subscription.*`

### 11. Diverse

- «App versjon v{{v}}» → `profile.appVersion`
- Fallback-strenger «Ukjent», «Ukjent feil» der de er UI-synlige → eksisterende `common.unknown` / ny `common.unknownError`

### Teknisk oppsummering

- Kun frontend: `ProfileDialog.tsx`, `SignaturePad.tsx`, `en.json`, `no.json`.
- Bruker eksisterende `useTranslation()` hook som allerede er i filen.
- Ingen endringer i database, RLS, edge functions eller andre komponenter.
- Verifiseres med `bunx tsgo --noEmit` og manuell sjekk med `rg` etter gjenværende norske strenger.
