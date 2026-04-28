Plan for @-tagging i merknader på oppdrag

Mål:
- Når en bruker skriver `@` i merknader-feltet på et oppdrag, vises en søkbar liste over godkjente personer i eget selskap.
- Valgte personer settes inn som synlige tags i merknaden.
- Når oppdraget lagres/opprettes, får nye taggede personer e-post med hele merknaden og lenke til AviSafe.

Endringer som bygges:

1. UI for @-tagging i `AddMissionDialog`
- Erstatte/utvide dagens enkle `Textarea` for `merknader` med en liten mention-funksjon.
- Bruke eksisterende `profiles`-data som allerede lastes i oppdragsdialogen, men begrense listen til godkjente brukere i samme selskap.
- Når brukeren skriver `@kar`, åpnes en popover under feltet med matchende navn.
- Ved valg settes navnet inn i teksten som f.eks. `@Kari Nordmann`.
- Feltet fortsetter å lagre vanlig tekst i `missions.merknader`, så eksisterende data og PDF-eksport påvirkes ikke.

2. Robust deteksjon av taggede personer
- Lage en hjelpefunksjon som finner hvilke profiler som er tagget i merknaden basert på navnene som finnes i selskapets personliste.
- Unngå duplikater hvis samme person tagges flere ganger.
- Ved redigering av oppdrag sendes e-post kun til nye tags som ikke fantes i merknaden før redigering, slik at brukere ikke spammes ved hver lagring.
- Ved nytt oppdrag sendes e-post til alle taggede personer.
- Avsender får ikke e-post til seg selv hvis de tagger seg selv, med mindre du ønsker det senere.

3. Ny e-posttype i eksisterende varslingsfunksjon
- Utvide `send-notification-email` med en ny type for `notify_mission_mention`.
- Funksjonen slår opp mottakerens e-post sikkert server-side basert på profil-ID.
- Den sjekker at mottakeren er godkjent og tilhører samme selskap som oppdraget.
- Den bruker eksisterende firmatilpasset avsenderoppsett (`getEmailConfig`) og e-postsending via prosjektets etablerte Resend-oppsett.

4. Informativ e-postmal
- Legge inn standardmal i `supabase/functions/_shared/template-utils.ts`.
- Malen skal inneholde:
  - personlig hilsen
  - hvem som tagget mottakeren
  - oppdragstittel
  - lokasjon
  - tidspunkt
  - hele merknaden/kommentaren
  - knapp/lenke: “Åpne oppdraget i AviSafe”
  - tydelig beskjed om at mottakeren er tagget og bør logge inn for å se kontekst

Forslag til emne:
`Du er tagget i et oppdrag: {{mission_title}}`

Forslag til tekst i malen:
- “Hei {{user_name}}, du har blitt tagget av {{sender_name}} i merknader på et oppdrag i AviSafe.”
- “Logg inn i appen for å se oppdraget, rute, ressurser og øvrig kontekst.”
- Merknaden vises i en egen uthevet boks.

5. Gjøre malen redigerbar i Admin
- Legge den nye maltypen inn i `EmailTemplateEditor`, slik at superadmin kan tilpasse tekst, emne og variabler senere.
- Variabler:
  - `{{user_name}}`
  - `{{sender_name}}`
  - `{{mission_title}}`
  - `{{mission_location}}`
  - `{{mission_date}}`
  - `{{mission_note}}`
  - `{{company_name}}`
  - `{{app_url}}`

6. Varslingspreferanser
- Jeg anbefaler å gjenbruke eksisterende e-postpreferanse for oppdragsvarsler i første omgang, eller sende mentions uansett fordi dette er en direkte tagg.
- For best UX/sikkerhet mot å gå glipp av direkte tags: direkte @-tagg sendes uavhengig av “Nytt oppdrag”-varsler.
- Hvis du heller vil ha egen av/på-innstilling for “E-post når jeg blir tagget i oppdrag”, kan jeg legge til en databasekolonne og valg i profildialogen, men det krever en liten migrasjon.

Filer som sannsynligvis endres:
- `src/components/dashboard/AddMissionDialog.tsx`
- `supabase/functions/send-notification-email/index.ts`
- `supabase/functions/_shared/template-utils.ts`
- `src/components/admin/EmailTemplateEditor.tsx`

Teknisk flyt:
```text
Bruker skriver merknad med @navn
        ↓
Oppdrag lagres/opprettes
        ↓
Frontend finner nye taggede profile_id-er
        ↓
Frontend kaller send-notification-email med notify_mission_mention
        ↓
Edge function validerer mottaker/selskap og henter e-post
        ↓
E-post sendes med firmakonfigurasjon og standard/custom mal
```

Merk:
- Ingen endring i databasestrukturen er nødvendig hvis vi sender direkte tagg-varsler uten egen preferanse.
- Hvis du ønsker egen varslingspreferanse for mentions, legger jeg til migrasjon for `notification_preferences.email_mission_mention` og et valg i profilen.