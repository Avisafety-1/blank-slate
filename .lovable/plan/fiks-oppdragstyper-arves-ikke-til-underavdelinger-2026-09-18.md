# Fiks: oppdragstyper arves ikke til underavdelinger

## Hva som er galt (bekreftet)

Tensio (morselskap) har «gjelder for alle avdelinger» slått på. Tensio Sør og Tensio Nord er avdelinger under Tensio.

Appen gjør riktig ting i frontend: den ser at morselskapet deler listen, og prøver å hente morselskapets oppdragstyper. Men tilgangsreglene i databasen for tabellen med oppdragstyper gir bare lesetilgang til eget selskap og til selskap som ligger *under* deg — ikke til selskapet du ligger under. Dermed får avdelingen null rader tilbake, og appen faller tilbake til den innebygde standardlista (Inspeksjon, Kartlegging, Foto/film ...). Det ser ut som arv ikke virker, og alle koblinger til dokumenter og vurderingsskjema på morselskapets typer mangler.

Tilgangsregelen for selve selskapsraden tillater derimot å lese morselskapet, derfor vises «arvet fra ...»-merknaden riktig — men lista under er feil.

## Endringer

### 1. Databasetilgang (hovedfiksen)

Ny hjelpefunksjon (SECURITY DEFINER, med REVOKE fra anon/authenticated/PUBLIC per prosjektregel) som returnerer morselskapets id **kun** når morselskapet har «gjelder for alle avdelinger» på.

Ny SELECT-policy på `company_mission_types` som i tillegg til dagens regel tillater lesing når `company_id` er den id-en funksjonen returnerer for innlogget bruker. Ingen skrivetilgang legges til — avdelinger skal fortsatt ikke kunne endre morselskapets liste.

### 2. Frontend-robusthet

I `src/hooks/useCompanyMissionTypes.ts`:
- Ikke fall tilbake til den hardkodede standardlista når lista er arvet fra morselskapet. Da er en tom liste et reelt svar, og standardlista skjuler feilen.
- Behold fallback som i dag for selskap som eier sin egen liste og ikke har lagt inn noen typer ennå.

## Verifisering

- Kjør en spørring som en bruker i Tensio Sør og bekreft at morselskapets typer kommer tilbake.
- Sjekk i appen at Tensio Sør ser Tensios liste (inkludert vedlagte dokumenter/vurderingsskjema) i oppdragstype-innstillingene og i dialogen for nytt oppdrag, og at lista er låst for redigering.
- Bekreft at et selskap uten morselskap, og en avdeling der bryteren er av, oppfører seg som før.
