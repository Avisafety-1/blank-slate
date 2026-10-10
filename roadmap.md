# Roadmap

## Pågående
- [x] Innboks: åpne og behandle saker i dialog over innboksen; sikre hurtighandlinger og e-postlenker uten automatisk mutasjon
- [x] Lesbarhet: kontraststerk gul tekst, felles WarningNote og kontroll i lys/mørk modus; kun visuelle endringer
- [x] SORA-profildialog: la veiledning og profilfelt dele rulleområde, med synlige knapper
- [x] Menyer: fjern lave lagoverstyringer og gi dropdown/undermenyer intern touch-rulling innenfor ledig skjermplass; behold modalitet og valg
- [x] Verneområder: ett kartlag med røde forbudssoner og oransje observasjonssoner fra dronesoner.no; synkroniser data og vis kilde/regler
- [x] Dashbord: én aktiv flytur i fast felt, intern rulling og pil for flere uten å skyve andre widgeter ned
- [x] SORA-dokument per oppdragstype og oppdrag, PDF-tolkning og gul merknad ved manglende dokument (DB-migrasjon uttrykkelig godkjent)
- [x] Risikovurdering: naturlig konklusjonsstart uten «I tillegg» og ingen krav om ny SORA per oppdrag
- [x] NOTAM: valgfritt polygon fra minst tre rutepunkter, med korrekt kartvisning og lagring
- [x] Månedsoversikt: fullbredde operativ kalender, integrert fargeforklaring og dagsliste under valgt dato
- [x] Ressurskalender: valg mellom dag-, uke- og månedsvisning med periodetilpasset navigasjon
- [x] Ressurskalender: samlet operativ ukestidslinje med fast ressurskolonne, zoom og konfliktmarkering
- [x] Status: risikovurdering for fløyne oppdrag fordelt på Go/Caution/No-Go/Ikke vurdert i skjerm og eksport
- [x] Oppdragsdokumenter: kun valgte droner, robust oppdragstypearv og avdelingsdialog for deling
- [x] IP-rating i dronekatalog og nedbørsvurdering under Vær, uten nye hard stops
- [x] Risikovurdering: én autoritativ kilde for faktiske hard-stop-årsaker; diagnostikk fjernet fra visning
- [x] /dji cache-fiks: versjonslinje i logg, SW/cache-tømming ved åpning, "Tøm buffer"-knapp (publish avbrutt — må publiseres på nytt)
- [x] MQTT-brokerfiler fra Fly.io lagret under mqtt-broker/
- [x] DJI Cloud API-bridge (bridge.py) + Fly multi-process; venter på at bruker setter SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY og deployer
- [x] Safari iOS/iPadOS: fiks frys og skjulte knapper i webappen (oppdateringsvarsel, modal-lås, synlig høyde, oppdragsdialog)
- [x] iOS Safari og Android-PWA: hold oppdragsdialogenes header og X synlige ved tastatur og etter lagring

- [x] Compliance-redesign trinn 1: færre faner, avdelingsvelger (?dept=), Oversikt med «Krever handling nå», nye KPI-er, compliance-score + oppfølgingsgrad, avdelingstabell, introkort, mindre banner
- [x] Compliance-redesign trinn 2: samme oppsett i Drift/Flåte/Personell og dokumenter/Hendelser (KPI-stripe → Krever handling → sammenleggbar «Statistikk og trender»), (i) på alle KPI-er/seksjoner, positive tomtilstander, layout-skeletons, tabeller→kort <768px

## Ferdig
- [x] DJI RC Pro portrett: loggbehandling viser loggliste og detaljer under hverandre i ett rullbart vindu; landskap uendret
- [x] Risikoscore viser +SORA etter re-vurdering; separate SORA-statusmerker fjernet fra oppdrag
- [x] Redesignet «Rediger dokument» med åpne, last ned og oppdater øverst
- [x] Batterikort-dialog mobiloptimalisert (offsets i stedet for breddeverdi)
- [x] 6 plakater for sosiale medier — ett bilde, ett sitat per plakat (1080x1350), i /mnt/documents/posters
- Tilgangsstyring /vedlikehold: droppet etter ønske fra bruker — ingen endringer på tilgangsregler
- [x] Elverum: DJI-synkekøen kjørt manuelt 08.09 (19 logger til behandling)
- [x] Rettet fastlåste sjekklister på nye oppdrag og konsekvent lagring fra oppdragstype
- [x] DJI-loggsynk: «Sync nå» drenerer egen kø umiddelbart, dagvindu for køen, manuell import sperres ikke av logger i kø, riktig melding i knappen
- [x] E-post ved nytt oppdrag: personell med rolle, ressurser, luftromsvarsler og værvarsel ved oppdragsstart
- [x] dji-geo-test: testfunksjon mot DJI geo-API (deploy + testkall Gardermoen/Oslo), slettes etter testing
- [x] AI-risikovurdering: dato, primærdrone i SORA-revurdering, observatør fra personell (rettelser A–C)
- [x] Fase 1: trygg AI-risikovurdering — decideApproval-godkjenningslogikk, konservativ håndtering av manglende data (befolkning/luftrom/vær), bare piloter teller som piloter, reset og varsler i vurderingsdialogen (edge deploy avventer klarsignal)
