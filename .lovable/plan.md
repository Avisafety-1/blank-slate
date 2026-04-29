Plan: Avdelingsvarsler for administratorer i mor-selskap

Målet er at en administrator i mor-selskapet kan velge å få varsler når relevante ting skjer i avdelingene, uten at vanlige brukere eller avdelingsbrukere får ekstra støy.

## Vurdering av hva som allerede finnes

Det er allerede delvis støtte for hierarki i noen varsler:

- Nye hendelser: mor-selskapets brukere med `can_be_incident_responsible` kan allerede fanges opp når en hendelse skjer i avdeling, men dette er bundet til ansvarlig-rollen og ikke en tydelig profilinnstilling for admin.
- Nye brukere til godkjenning: admin i mor-selskap inkluderes allerede når en ny bruker registrerer seg i avdeling.
- Oppdrag til godkjenning: har allerede egen logikk for godkjennere og `approval_company_ids`, så denne bør ikke blandes med en generell avdelingsvarsling.
- Oppfølgingsansvar: bør fortsatt gå direkte til den som faktisk er satt som ansvarlig, uavhengig av selskap.
- Dokument-/vedlikeholds-/kompetansepåminnelser og oppdragspåminnelser er i dag i hovedsak knyttet til brukerens eget selskap/egne ressurser.

## Foreslått funksjonell løsning

Legg til en egen seksjon i Profil -> Varslinger som bare vises for administratorer i et mor-selskap:

```text
Varslinger fra avdelinger
[ ] Nye hendelser i avdelinger
[ ] Nye oppdrag i avdelinger
[ ] Nye brukere i avdelinger
[ ] Dokumenter som utløper i avdelinger
[ ] Vedlikehold/inspeksjon i avdelinger
```

Dette gir mening fordi dette er “selskapshendelser” som en mor-admin kan ønske å overvåke på tvers. Jeg vil ikke utvide disse som standard:

- Oppfølgingsansvar: beholdes personbasert.
- Oppdrag til godkjenning: beholdes styrt av godkjenneroppsett/avdelingsvalg.
- Kompetanseutløp: beholdes personbasert i første omgang, fordi det fort blir sensitivt/støyende og krever en egen “personell/kompetanse på tvers”-vurdering.
- Push for avdelingsvarsler: venter med dette først, for å unngå at mobile push blir for bredt før e-postlogikken er korrekt.

## Databasemodell

Utvid `notification_preferences` med egne boolean-felt for avdelingsvarsler:

- `email_child_incidents`
- `email_child_missions`
- `email_child_new_user_pending`
- `email_child_document_expiry`
- `email_child_maintenance_reminder`

Alle settes til `false` som standard, slik at eksisterende brukere ikke plutselig får flere e-poster.

RLS trenger normalt ikke endres, fordi brukeren allerede bare kan lese/oppdatere egne `notification_preferences`.

## UI-endringer

I `ProfileDialog.tsx`:

1. Utvide `NotificationPreferences`-typen med de nye feltene.
2. Hente om innlogget bruker er admin i mor-selskap. Dette kan gjøres ut fra eksisterende `accessibleCompanies`/hierarki eller ved en liten query mot `companies` for å se om eget selskap har avdelinger.
3. Vise seksjonen “Varslinger fra avdelinger” kun når:
   - brukeren er admin/superadmin, og
   - eget selskap har avdelinger.
4. Bruke eksisterende `updateNotificationPref(...)` for å lagre bryterne.
5. Legge inn forklarende tekst, f.eks. “Gjelder hendelser/opprettelser i avdelinger under ditt mor-selskap.”

## Edge function-endringer

Oppdatere e-postutsendingene slik at mottakerlisten inkluderer mor-admins som eksplisitt har slått på avdelingsvarsler.

### `send-notification-email`

For `notify_new_incident`:
- Varsle samme selskap som før via `email_new_incident`.
- Hvis hendelsen tilhører en avdeling, legg til admins i parent company med `email_child_incidents = true`.
- Behold eksisterende ansvarlig-logikk, men dedupliser mottakere så samme person ikke får to e-poster.

For `notify_new_mission`:
- Varsle samme selskap som før via `email_new_mission`.
- Hvis oppdraget tilhører en avdeling, legg til admins i parent company med `email_child_missions = true`.

For `notify_admins_new_user`:
- Behold dagens logikk for admin-varsling.
- Stram preferansen slik at mor-admins for avdelingsregistreringer styres av `email_child_new_user_pending`, mens admin i samme selskap fortsatt bruker `email_new_user_pending`.

### `check-document-expiry`

Når dokumenter i avdeling nærmer seg utløp:
- Send til brukere i samme avdeling med `email_document_expiry = true` som før.
- I tillegg send til admins i mor-selskapet med `email_child_document_expiry = true`.
- Inkluder avdelingsnavn i malen/fallback der det er mulig.

### `check-maintenance-expiry`

Når ressurser i avdeling krever vedlikehold/inspeksjon:
- Behold dagens varsling til relevante brukere/teknisk ansvarlig i eget selskap.
- I tillegg send oppsummering til admins i mor-selskapet med `email_child_maintenance_reminder = true`.
- Dedupliser og grupper per avdeling der praktisk.

## Teknisk mønster

Jeg vil lage små hjelpefunksjoner inne i edge functions for å unngå duplisert og feilutsatt logikk:

```text
getParentCompanyId(companyId)
getParentAdminsWithPreference(parentCompanyId, preferenceColumn)
dedupeUserIds([...])
```

Dette gjøres server-side med service role i edge functions, ikke i klienten. Admin-status baseres på `user_roles`, ikke localStorage eller hardkodede e-poster.

## Hva jeg ikke gjør i denne runden

- Ingen endring av senderadresse eller e-postdomene.
- Ingen ny rollemodell.
- Ingen automatisk påslåing for eksisterende admins.
- Ingen bred “alle varsler fra alle avdelinger”-bryter som overstyrer alt; hver kategori kan styres separat.
- Ingen endring i hvordan oppdragsgodkjenning fungerer.

## Etter implementering

Jeg vil kontrollere med søk at alle nye felter brukes konsekvent i UI og edge functions, og at eksisterende varslingsfelt fortsatt fungerer som før.