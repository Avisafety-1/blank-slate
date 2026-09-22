# IP-rating i dronekatalog og risikovurdering

## Mål
Utvid alle 61 modellene i dronekatalogen med etterprøvbar IP-informasjon, og bruk den mot varslet nedbør i kategorien **Vær**. Nedbør/IP skal gi informasjon og advarsel, men aldri hard stop alene.

## Datagrunnlag og kildekrav
- Legg til katalogfelter for IP-rating, kildestatus, produsentkilde (URL), dato kilden sist ble kontrollert og en kort produsentbegrensning for regn/vann.
- Registrer IP-rating bare når den gjelder **selve luftfartøyet** og kan dokumenteres i produsentens spesifikasjon, manual eller annen primær dokumentasjon.
- Ikke overfør rating fra fjernkontroll, dock, batteri eller nyttelast til dronen.
- Ikke oversett uttrykk som «weather resistant» til en IP-rating, og ikke utled en regnintensitet i mm/t fra IP-koden.
- Modeller uten publisert, entydig primærkilde lagres og vises som **Ikke dokumentert**. Dette er informasjon, ikke automatisk begrensning eller stopp.
- Kildene lagres per modell slik at opplysningene kan etterprøves. Bekreftede eksempler fra produsentkilder omfatter blant annet Matrice 30-serien IP55, Matrice 300 RTK IP45, Matrice 350 RTK IP55, Matrice 4D/4TD IP55, Matrice 400 IP55, FlyCart 30 IP55, Autel Dragonfish IP43, Autel EVO Max 4T IP43, Parrot Anafi USA IP53 og Skydio X10 IP55. Resten merkes ikke dokumentert med mindre samme kildekvalitet finnes.

## Dronekatalog og visning
- Oppdater katalogtabellen og alle 61 modellradene gjennom en migrasjon, med eksplisitte `GRANT`-rettigheter bevart for autentiserte lesere og service-rollen.
- Vis IP-rating eller «Ikke dokumentert» sammen med en kildekobling i droneinformasjonen på `/ressurser` og i detaljvisningen fra dashbordet.
- Ta IP-feltet med i modellvalget når en drone opprettes eller redigeres, uten å kopiere kildeverdien til fritekst eller individuelle dronefelter.
- Oppdater genererte datatyper og alle nye brukerrettede tekster på både norsk og engelsk.

## Risikovurdering under Vær
- Send oppdragets planlagte tidspunkt til værtjenesten, slik at vurderingen bruker nedbørsprognosen for oppdraget fremfor alltid nærmeste nåværende værpunkt.
- Send valgt drones dokumenterte IP-rating, kildestatus og produsentbegrensning inn i risikokonteksten.
- Beregn en deterministisk nedbør/IP-observasjon før resultatet lagres:
  - Ingen varslet nedbør: vis IP-status som informasjon uten scoretrekk.
  - Varslet nedbør + dokumentert IP: vis mengde/periode, rating og produsentens begrensning; legg til væradvarsel og la samlet alvorlighet følge eksisterende nedbørsnivå.
  - Varslet nedbør + ikke dokumentert IP: opplys at regnbestandighet ikke er dokumentert og at pilot må kontrollere produsentmanual/operative begrensninger; kun informasjon utover den eksisterende nedbørsadvarselen.
  - Aldri konverter IPX3/IPX4/IPX5 til en oppdiktet mm/t-grense, og aldri la IP/nedbør alene utløse hard stop.
- Sørg for at observasjonen havner i `categories.weather.actual_conditions` og/eller `concerns`, på riktig språk, og ikke i kategorien Utstyr.
- Når værvurdering hoppes over, skal også IP/nedbørsvurderingen hoppes over.

## Kvalitetssikring
- Legg en separat, testbar regelmodul rundt IP/nedbør slik at AI ikke kan finne på rating, kilde eller hard stop.
- Test dokumentert rating, ukjent rating, null nedbør, lett/kraftig nedbør, fler-times nedbørsintervall, hoppet over vær, norsk/engelsk og at ingen IP-situasjon alene gir hard stop.
- Kontroller modellmatching for kombinerte katalognavn som «Mini 3 / Mini 3 Pro» og «Mavic 3 Pro / Cine»; rating brukes bare hvis kilden faktisk dekker alle variantene i raden, ellers blir raden «Ikke dokumentert».
- Kjør `deno test` for risikoreglene, `npx tsgo --noEmit -p tsconfig.app.json` og `git diff --check`.
- Deploy de oppdaterte `drone-weather`- og `ai-risk-assessment`-funksjonene med deploy-verktøyet etter validering.

## Avgrensning
- Historiske risikovurderinger omskrives ikke automatisk.
- Ingen IP-rating eller regntoleranse gjettes fra sekundærkilder.
- Nedbør/IP endrer ikke hard-stop-reglene, i tråd med valgene dine.
