# Leverandørbeskrivelse av AviSafe (PDF)

Lage en ny PDF-artefakt på maks 2 A4-sider som beskriver AviSafe på et overordnet, ikke-teknisk nivå – egnet for kunder/revisorer som trenger «leverandørens beskrivelse av systemet».

## Mal og stil
Bruke samme visuelle mal som `docs/sikkerhetsdokumentasjon.md` (samme fonter, farger, headerstruktur, footer). Eksisterende fil rørres ikke.

## Leveranse
- Ny fil: `/mnt/documents/avisafe-leverandorbeskrivelse.pdf`
- Genereres med Python (reportlab) i et engangsskript – ingen endringer i app-koden.

## Innhold (2 sider)

**Side 1**
1. **Om AviSafe** – konseptuell hensikt: én samlet plattform for drift, sikkerhet og etterlevelse for droneoperatører og flyselskaper i Norden.
2. **Hvem det er for** – droneoperatører, flyselskaper, parent/datterselskap-strukturer.
3. **Kjernemoduler (kort beskrivelse hver):**
   - Oppdrag & ruteplanlegging
   - Risikovurdering / SORA
   - Hendelsesrapportering (avvik, anonymt, ECCAIRS)
   - Ressurser (droner, utstyr, vedlikehold, batterier)
   - Personell & kompetanse
   - Loggbok (manuell + automatisk import)
   - Dokumenter & sjekklister
   - Kart & luftrom
   - Kalender & varsler
   - Trening & kurs
   - Marketing (Avisafe-intern)

**Side 2**
4. **Integrasjoner (overordnet):**
   - DJI FlightHub 2 / DJI loggimport
   - ArduPilot loggimport
   - DroneTag (live posisjon)
   - SafeSky (luftromtrafikk)
   - BarentsWatch AIS
   - OpenAIP, dronesoner.no (NO), dronezoner.eu (DK), NOTAM, NVE, SSB
   - ECCAIRS 2.0 (hendelsesrapportering til myndigheter)
   - Resend (e-post), LinkedIn / Meta (marketing)
   - Sentry (feilovervåking)
5. **Driftsmodell** – SaaS, skybasert, PWA m/ offline-støtte, mobil + desktop.
6. **Leverandør & kontakt** – AviSafe AS som leverandør.

## QA
Etter generering: konvertere begge sider til JPEG (`pdftoppm`) og inspisere – sjekke at innholdet faktisk får plass på 2 sider, ingen avkutting, lesbar typografi. Justere fontstørrelse/spacing til det stemmer, før artefakten leveres.
