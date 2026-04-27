Plan for ny funksjon: «Kan ikke godkjenne egne oppdrag»

Målet er at en person med rollen/tilgangen «Kan godkjenne oppdrag» ikke kan godkjenne et oppdrag der vedkommende selv er satt som flyger/personell på oppdraget, når selskapsinnstillingen er aktivert.

1. Database og innstillingsarv
- Legg til ny kolonne på `companies`:
  - `prevent_self_approval boolean NOT NULL DEFAULT false`
- Legg til ny propagasjonskolonne:
  - `propagate_prevent_self_approval boolean NOT NULL DEFAULT false`
- Utvid selskapsinnstillingene slik at denne følger samme mønster som eksisterende «Gjelder for alle underavdelinger»:
  - Når morselskapet aktiverer arv, kopieres verdien til underavdelinger.
  - Underavdelinger får feltet låst og merket «Arvet fra …».

2. Admin UI: selskapsinnstillinger
- Legg til en ny toggle i `Selskapsinnstillinger`:
  - Tittel: «Kan ikke godkjenne egne oppdrag»
  - Forklaring: «Når aktivert kan en godkjenner ikke godkjenne oppdrag der vedkommende selv er satt som flyger/personell.»
- Toggle skal være låst for underavdelinger når morselskapet har aktivert arv.
- Hovedbryteren «Gjelder for alle underavdelinger» skal også inkludere denne nye innstillingen.

3. Bruk effektiv selskapsinnstilling i appen
- Utvid `useCompanySettings` med `prevent_self_approval`.
- Sørg for at innstillingen invaliders/refetches på samme måte som de andre selskapsinnstillingene når admin endrer den.

4. Håndheving ved godkjenning
- I profil-dialogen der godkjennere ser «Oppdrag til godkjenning»:
  - Hent oppdragets `mission_personnel` for ventende oppdrag.
  - Hvis innstillingen er aktivert og innlogget bruker finnes i oppdragets personelliste, deaktiver «Godkjenn»-knappen.
  - Vis tydelig forklaring, f.eks. «Du er satt som flyger/personell på dette oppdraget og kan derfor ikke godkjenne det.»
- Legg også inn en siste kontroll i `handleApproveMission` før databaseoppdateringen, slik at direkte UI-klikking eller stale data ikke kan godkjenne likevel.

5. Varsling og listevisning
- Når et oppdrag sendes til godkjenning, filtrer godkjennere slik at varsel ikke går til personer som ikke kan godkjenne fordi de selv er på oppdraget, når innstillingen er aktivert.
- Hvis alle godkjennere er inhabile, vis en tydelig feilmelding når oppdraget sendes til godkjenning:
  - «Ingen tilgjengelige godkjennere. Alle godkjennere er tilknyttet oppdraget.»

Tekniske detaljer
- Relevante filer som oppdateres:
  - `supabase/migrations/...sql` for nye company-felt.
  - `src/components/admin/ChildCompaniesSection.tsx` for toggle, arv og låsing.
  - `src/hooks/useCompanySettings.ts` for ny innstilling.
  - `src/components/ProfileDialog.tsx` for å blokkere godkjenning av egne oppdrag.
  - `src/hooks/useOppdragData.ts` for innsending til godkjenning og eventuell validering av tilgjengelige godkjennere.
  - `supabase/functions/send-notification-email/index.ts` for å unngå å sende godkjenningsvarsel til inhabile godkjennere.
- Ingen roller lagres på `companies`; dette er kun en selskapsinnstilling. Eksisterende godkjenner-tilgang på profiler beholdes slik den fungerer i dag.
- Håndhevingen blir både i UI og i godkjenningshandleren. Om ønskelig kan vi i neste steg flytte selve godkjenningsoperasjonen til en egen Edge Function for sterkere server-side validering, men denne planen holder seg til dagens arkitektur.