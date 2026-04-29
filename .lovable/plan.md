Plan for ny selskapsinnstilling: «Hendelsesrapporter synlig for alle selskaper»

Målet er at et morselskap kan aktivere én innstilling som gjør at hendelser registrert i morselskapet og alle underavdelinger vises på tvers av hele selskapsstrukturen. Innstillingen skal ikke ha «gjelder for underavdelinger», fordi effekten automatisk gjelder hele konsern-/avdelingshierarkiet når den er aktivert.

1. Database: legg til ny innstilling på companies
- Legge til et nytt boolean-felt på `companies`, f.eks. `incident_reports_visible_to_all_companies boolean not null default false`.
- Feltet lagres på selskapet som aktiverer innstillingen. For en avdeling vil appen sjekke morselskapets verdi, slik at man slipper egen propagasjons-/arvelogikk.

2. Database/RLS: utvid lesetilgang for incidents
- Oppdatere SELECT-policy for `incidents` slik at brukere fortsatt ser det de ser i dag via `get_user_visible_company_ids(auth.uid())`.
- I tillegg: hvis morselskapet for brukerens selskap har aktivert `incident_reports_visible_to_all_companies`, skal brukeren kunne lese hendelser der `company_id` tilhører samme morselskap eller en av morselskapets avdelinger.
- Dette bør gjøres via en `SECURITY DEFINER`-hjelpefunksjon for å unngå rekursiv RLS mot `companies`/`incidents` og følge eksisterende RLS-mønster i prosjektet.
- Oppdatere tilhørende SELECT-policy for `incident_comments`, slik at kommentarer på hendelser som nå blir synlige på tvers av avdelinger også kan leses.

3. Selskapsinnstillinger i admin
- Legge til toggle i `Selskapsinnstillinger`:
  - Label: «Hendelsesrapporter synlig for alle selskaper»
  - Beskrivelse: «Når aktivert kan alle avdelinger i samme selskap se hendelsesrapporter fra hverandre. Innstillingen styres av morselskapet og trenger ikke ‘gjelder for underavdelinger’.»
- For morselskap: togglen kan endres.
- For underavdeling: vise morselskapets verdi som låst/arvet informasjon, siden underavdelingen ikke skal styre dette selv.
- Ikke koble denne innstillingen til eksisterende `applySettingsToChildren` eller `propagate_*`-felter.

4. Appens company settings-hook
- Utvide `useCompanySettings` med det nye feltet.
- For underavdelinger må hooken hente effektiv verdi fra morselskapet når relevant, slik at visninger og anonymitetslogikk kan bruke samme settings-objekt uten duplisering.
- Invalidering av settings-cache beholdes ved lagring.

5. Hendelseslisten og filtrering
- `Hendelser`-siden henter allerede `incidents` uten lokal company-filter, og RLS bestemmer hva brukeren får. Etter RLS-endringen skal listen automatisk kunne inneholde hendelser fra andre avdelinger når innstillingen er aktiv.
- Legge til/validere visning av selskaps-/avdelingsnavn i hendelseskortet når listen inneholder flere selskaper, slik at det er tydelig hvilken avdeling hendelsen kommer fra.
- Offline cache-nøkkelen beholdes per innlogget selskap, men innholdet kan nå inkludere flere avdelinger når innstillingen er aktiv.

6. Anonymitet / pilotnavn
- Eksisterende logikk skjuler navn ved `reported_anonymously` eller `hide_reporter_identity`, og viser navn for admin i morselskap når avdelinger er aktivert.
- Jeg vil stramme dette opp slik at:
  - Hvis `reported_anonymously = true`: navnet skjules for alle unntatt admin i morselskapet.
  - Hvis global «Skjul identitet til rapportør» er aktiv: samme prinsipp, navnet skjules for vanlige brukere/avdelinger.
  - Listevisning og detaljdialog bruker samme hjelpefunksjon, slik at de ikke viser ulike resultater.
- PDF-eksport bør også respektere samme anonymitetsregel, slik at anonym rapportør ikke lekker i eksport for avdelingsbrukere.

7. Status/statistikk
- Eksisterende status/statistikk-spørringer for hendelser går også via `incidents` og vil derfor følge RLS. Når innstillingen er aktiv, kan hendelsestall inkludere hele selskapsstrukturen.
- Om ønskelig kan visningen senere få filter per avdeling, men det er ikke nødvendig for denne innstillingen.

Tekniske endringer
- Supabase migration:
  - Ny kolonne på `companies`.
  - Ny/oppdatert `SECURITY DEFINER`-funksjon for effektive synlige hendelsesselskaper.
  - Oppdatert SELECT-policy for `incidents`.
  - Oppdatert SELECT-policy for `incident_comments`.
- Frontend:
  - `src/hooks/useCompanySettings.ts`
  - `src/components/admin/ChildCompaniesSection.tsx`
  - `src/pages/Hendelser.tsx`
  - `src/components/dashboard/IncidentDetailDialog.tsx`
  - `src/lib/incidentPdfExport.ts`

Forventet resultat
- Morselskap kan slå på én innstilling som gjør hendelser synlige på tvers av alle avdelinger i samme selskapsstruktur.
- Underavdelinger får ikke egen «gjelder for underavdelinger» for denne innstillingen.
- Anonyme rapporter viser ikke pilot/rapportørnavn for avdelinger eller vanlige brukere, men morselskapets admin kan fortsatt se navnet.