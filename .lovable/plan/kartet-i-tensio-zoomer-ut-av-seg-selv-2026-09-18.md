# Kartet i Tensio zoomer ut av seg selv

## Hva som skjer

Kartet bygges helt på nytt hver gang appen endrer mening om hvorvidt brukeren tilhører Tensio-hierarkiet. Når kartet bygges på nytt, starter det på sitt standard utsnitt — altså hopper det ut fra der brukeren hadde zoomet inn.

Hvorfor bare Tensio: sjekken "tilhører dette selskapet Tensio?" er den eneste selskapsavhengige verdien kartet er bygget på. For alle andre selskaper er svaret alltid "nei" og endrer seg aldri. For Tensio er svaret "ja", men det hentes fra serveren hver gang innloggingen friskes opp (fanebytte, låst skjerm, tokenfornyelse, dårlig nett). Slår oppslaget feil eller kommer tomt tilbake, tolkes det som "nei", kartet rives ned og bygges opp igjen — og så igjen når riktig svar kommer. Resultatet er et plutselig utzoom midt i arbeidet.

Antall aktive kartlag er ikke årsaken i seg selv, men gjør utslaget mer synlig: alt må lastes på nytt hver gang.

## Hva som skal gjøres

1. Kartet skal ikke lenger bygges på nytt når Tensio-statusen endrer seg. Tensio-laget legges til eller fjernes for seg, uten å røre resten av kartet eller utsnittet.
2. Et bekreftet "ja" skal ikke kunne falle tilbake til "nei" på grunn av et feilet eller tomt oppslag — statusen beholdes til vi får et tydelig svar.
3. Kartlag-menyen oppdateres tilsvarende, slik at "Luftnett Tensio" dukker opp/forsvinner uten at kartet nullstilles.
4. Sjekkes i forhåndsvisning: zoom langt inn, bytt fane / lås skjerm og kom tilbake — utsnittet skal stå urørt, og Tensio-laget skal fortsatt være der.

## Teknisk

- `src/components/OpenAIPMap.tsx`
  - Fjern `isTensioHierarchy` fra avhengighetslisten til hoved-init-effekten (linje 1893) så `map.remove()`/`L.map(...).setView(...)` ikke kjøres på nytt.
  - Flytt opprettelse/fjerning av `tensioLuftnettLayer` (linje 1151–1162) til en egen effekt som reagerer på `isTensioHierarchy`, med `tensioLuftnettLayerRef`. Legg laget til på eksisterende kartinstans og respekter lagrede standardvalg (`resolveLayerDefault`).
  - Oppdater `layerConfigs`-listen som sendes til `MapLayerControl` fra samme effekt (legg til / fjern `tensio_luftnett`-oppføringen i state) i stedet for kun ved init.
- `src/components/OpenAIPMap.tsx` linje 284–297: ikke sett `false` når `resolveRootCompanyName` returnerer `null`; behold forrige kjente verdi. Effekten bør i praksis kun reagere på `companyId`.
- `src/lib/companyHierarchy.ts`: uendret oppførsel (feil caches fortsatt ikke), men den som kaller må skille "vet ikke" fra "nei".
- Ingen databaseendringer, ingen endringer i tilgangsregler.
