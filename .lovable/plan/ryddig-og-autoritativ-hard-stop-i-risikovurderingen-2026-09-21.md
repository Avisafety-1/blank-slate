# Ryddig og autoritativ HARD STOP i risikovurderingen

## Mål

HARD STOP-feltet skal bare vise aktive stoppårsaker. Forklaringer om forhold som ikke utløser stopp — som «ingen 5 km-soner», «ingen Ninox-godkjenning kreves» og «utenfor kontrollert luftrom» — skal fortsatt kunne stå i riktig fagseksjon, men aldri i HARD STOP-banneret, historikken eller PDF-en.

## Gjennomføring

1. **Én autoritativ hard-stop-kilde**
   - Flytt avgjørelsen ut av AI-friteksten og bygg en deterministisk liste over aktive stoppårsaker etter at alle analyser og vakter er ferdige.
   - Listen vurderer faktiske data mot gjeldende selskapskrav: værgrenser, rød status på valgt drone/oppdragsutstyr, pilotkompetanse og inaktivitet, maksimal høyde, BVLOS, natt/sivil skumring, befolkningstetthet, observatør og reservekrav der pålitelig input finnes.
   - Flere samtidige stopp beholdes som flere korte årsaker i stedet for at én overskriver en annen.
   - Manglende eller tvetydig datagrunnlag skal ikke oppfinnes som stoppårsak; det forblir en merknad i relevant kategori.

2. **Stram AI-instruksjonen på norsk og engelsk**
   - Presiser at `hard_stop_reason` kun kan beskrive betingelser som faktisk er brutt.
   - Forby negative bekreftelser og diagnostikk i feltet, som «ingen krav», «ikke nødvendig», «utenfor sonen» og forklaringer om at tekst er fjernet.
   - Behold utfyllende luftroms-, vær- og policyforklaringer i sine respektive kategorier.

3. **Sluttbehandling før lagring**
   - Fjern dagens konstruksjon som legger «Luftromsbegrunnelse fjernet …» til en annen stoppårsak.
   - Sett `hard_stop_triggered`, `hard_stop_reason` og endelig anbefaling samlet fra den autoritative listen rett før lagring.
   - Sørg for at sammendraget ikke motsier endelig HARD STOP-status eller introduserer andre påståtte stoppårsaker.

4. **Lik visning overalt**
   - Dagens resultatside, historikk og PDF bruker det lagrede feltet direkte. De skal derfor få samme rene stopptekst uten egne avvikende regler.
   - Ingen databasehistorikk omskrives automatisk; rettingen gjelder nye og re-kjørte vurderinger.

## Teknisk

- Hovedendring: `supabase/functions/ai-risk-assessment/index.ts`.
- Promptbegrensninger: `supabase/functions/ai-risk-assessment/prompts.ts`, både norsk og engelsk.
- Legg hard-stop-utledningen i en isolert hjelpefunksjon slik at kombinasjoner og falske positive kan testes uten AI-kall.
- Legg til fokuserte tester for: ren pilotstopp, flere samtidige stopp, avvist luftromsstopp, ingen stopp, hoppet-over vær og manglende datagrunnlag.
- Deploy `ai-risk-assessment` med deploy-verktøyet etter validering.

## Verifisering

- Kjør testene for hard-stop-utledningen.
- Kjør `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
- Kjør en ny vurdering på et oppdrag med reell pilotstopp og luftrom uten stopp; banner, lagret vurdering og PDF skal kun angi pilotårsaken.
- Kjør en vurdering uten aktive stopp; `hard_stop_triggered` skal være `false`, årsaken `null`, og ingen «ingen/ikke nødvendig»-tekst skal vises som stopp.