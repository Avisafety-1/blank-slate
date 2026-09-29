# SORA-dokument per oppdragstype og tydeligere risikovurdering

## Hva som skjer i dag
- **Brå start («I tillegg er …»):** Appen fjerner setninger om BVLOS-kompetanse fra konklusjonen etter at AI-en har skrevet den. Når første setning inneholder både hovedkonklusjonen og ordet «kompetanse», forsvinner hele setningen. Da blir neste setning, som starter med «I tillegg», stående først.
- **«Krever full SORA-analyse» / «Manglende SORA-analyse»:** Instruksjonene til AI-en sjekker `mission.sora` og ber den trekke tre poeng og anbefale NO-GO hvis dette mangler ved BVLOS. Det forveksler oppdragets SORA-fane med selskapets eksisterende SORA/driftstillatelse.
- Oppdragstyper kan allerede ha dokumenter som velges automatisk når et oppdrag opprettes, men risikovurderingen leser i dag bare navn, kategori og beskrivelse av dokumenter knyttet til selskapets SORA-innstillinger — ikke PDF-innholdet.

## Endringer
1. **Konklusjonen skal alltid begynne naturlig**
   - Gjør oppryddingen av BVLOS-kompetansetekst mer presis, slik at hovedkonklusjonen ikke forsvinner med en relevant setning.
   - Hvis en setning likevel fjernes, tas «I tillegg», «Videre», «Også» og lignende bort fra starten av neste setning, og første bokstav blir stor.
   - AI-en bes starte med hovedbeslutningen og bare omtale faktiske forhold som er relevante for dette oppdraget.
2. **Knytt selskapets SORA til oppdraget uten å skrive en ny SORA**
   - I innstillinger for oppdragstyper: når et eksisterende dokument knyttes til en type, kan administrator huke av «SORA». Vis tydelig hvilket dokument som er merket; bare PDF-dokumenter kan merkes.
   - Det merkede dokumentet følger automatisk oppdragstypen ved opprettelse og vises som valgt SORA på førstesiden av risikovurderingen. Tillat valg/bytte blant dokumenter brukeren har tilgang til for akkurat dette oppdraget; ikke endre selskapets originaldokument.
   - Respekter arvede oppdragstyper og eksisterende tilgang/deling mellom moderavdeling og avdelinger. Verifiser dokumenttilgang før vurderingen leser innholdet.
3. **La risikovurderingen bruke PDF-innhold, med klare grenser**
   - Hent tekst fra den valgte PDF-en, med sidehenvisninger og praktiske grenser for filstørrelse/antall sider. Bruk relevante utdrag som referanse for grenser, tiltak og operasjonsbetingelser — ikke anta at hele oppdraget er dekket bare fordi dokumentet finnes.
   - Vis når teksten ikke kan leses (f.eks. skannet PDF uten søkbar tekst), og fall tilbake til kun dokumentreferanse og en gul merknad; ikke fremstille PDF-en som gjennomgått.
   - Merk kilden i resultatet, og skill mellom «SORA-dokument knyttet til oppdraget» og «oppdraget er verifisert innenfor godkjent operasjonsomfang». AI-tolkning erstatter ikke operatørens kontroll av tillatelsen.
4. **Rett SORA-ordlyden og alvorlighetsgraden**
   - Fjern automatisk poengtrekk/NO-GO utløst kun av tom SORA-fane eller manglende dokument, slik du valgte. Uten SORA-dokument: én gul merknad om å kontrollere at operasjonen dekkes av selskapets tillatelse, ikke et krav om ny SORA for hvert oppdrag.
   - Med dokument: henvis til det navngitte dokumentet og relevante funn, ikke generiske påstander om «full/manglende SORA». Behold uavhengige sikkerhetsstopp for faktiske operative forhold.
   - Oppdater norsk og engelsk tekst.

## Avgrensning
- Dette lager ikke en ny SORA eller en myndighetsgodkjenning. PDF-er uten lesbar tekst kan trenge separat OCR-støtte senere.
- Eldre vurderinger endres ikke; kjør vurderingen på nytt for å se oppdateringen.

## Tekniske detaljer
- Opprett en eksplisitt tilknytning mellom oppdragstype og SORA-dokument, samt et valg på oppdraget. Databasemigrasjon med selskapstilpasset tilgang, GRANT og RLS legges frem til **egen uttrykkelig forhåndsgodkjenning i chatten før den kjøres**.
- Tilpass eksisterende oppdragstype-dokumentflyt og risikovurderingens førsteside; valget følger også avdelingens synlighetsregler. Sjekk tilgang på serversiden før PDF leses.
- Undersøk PDF-uttrekk i edge-miljøet og bruk en pålitelig parser for tekstbaserte PDF-er; ikke send hele store dokumenter til AI-en. Ta med dokumentnavn og sidetall, og ignorér dokumenttekst som prøver å gi instruksjoner til AI-en.
- Oppdater `competency.ts`-opprydding og `prompts.ts` på begge språk. Test oppdrag med/uten dokument, skannet PDF, avdelingsarv, og konklusjon som ellers ville startet «I tillegg». Deploy først etter test.
