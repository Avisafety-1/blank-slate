

## Plan: Generer AI-søkemotor-spec for avisafe.no landingsside

### Hva
Generere en ferdig system-prompt/spec som du kan bruke i ditt landingsside-prosjekt. Denne speccen definerer en AI-assistent som kun svarer på spørsmål om Avisafe-plattformens funksjoner og tjenester. Ingen kodeendringer i dette prosjektet.

### Leveranse
En komplett system-prompt som tekstfil til `/mnt/documents/avisafe-ai-spec.md`, klar til bruk i en edge function på landingssiden.

### Innhold i speccen
Basert på gjennomgang av hele kodebasen, vil speccen dekke:

**Kjernemoduler:**
- Dashboard (draggable widgets, KPI, nyheter, AI-søk, aktive flygninger)
- Oppdrag (opprettelse, planlegging, ruteplanlegging, vær/luftrom-sjekk, risikoanalyse, PDF/KMZ-eksport, sjekklister, kundeoversikt)
- Kart (SafeSky live-trafikk, OpenAIP luftrom, væroverlay, befolknings-/arealbrukskart fra SSB, VLOS-måling, ruteplanlegging, KML/KMZ-import)
- Ressurser (droner, utstyr, personell, kompetansehåndtering, vedlikeholdsplan, DroneTag-integrasjon)
- Dokumenter (versjonskontroll, sjekklister, kategorisering, varsling utløpsdatoer, synlighet)
- Hendelser (rapportering, oppfølgingsaktiviteter, ECCAIRS E2-rapportering til Luftfartstilsynet, PDF-eksport)
- Kalender (hendelser, vedlikehold, oppdragsfrister, ICS-eksport, kalenderabonnement)
- Status (statuspanel for hele organisasjonen)
- Statistikk (KPI-dashboard, grafer, plattformaktivitetslogg)

**Avanserte funksjoner:**
- SORA-risikoanalyse (Specific Operations Risk Assessment)
- AI-risikoanalyse med automatiske anbefalinger
- DJI-flightlog import (automatisk synkronisering + manuell)
- 3D flyanalyse med telemetridata (pitch/roll/yaw, batteristatus, altitude, 3D-modell)
- Droneregelverk-AI (chatbot for EASA/norsk droneregelverk)
- Push-varsler (PWA)
- Offline-støtte
- Tofaktorautentisering (TOTP + passkeys/WebAuthn)
- Flerspråklig (norsk/engelsk)
- Moderselskap/avdeling-hierarki med settingsarv

**Abonnementer:**
- Starter (99 kr/bruker/mnd)
- Grower (199 kr/bruker/mnd)
- Professional (299 kr/bruker/mnd)
- Tillegg: SORA Admin, DJI-integrasjon, ECCAIRS

**Integrasjoner:**
- SafeSky (live lufttrafikk)
- OpenAIP (luftrom, hindringer)
- DJI FlightHub/flightlogs
- DroneTag (Remote ID)
- ECCAIRS/E2 (Luftfartstilsynet)
- Stripe (betalinger)

### Implementering
Jeg bruker `lov-exec` for å skrive speccen til `/mnt/documents/avisafe-ai-spec.md`. Ingen endringer i kodebasen.

