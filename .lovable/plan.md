

## Forbedre AviSafe Visual Generator med ekte app-referanser

### Problem
AI-generatoren lager generiske SaaS-dashboards som ikke ligner AviSafe i det hele tatt. Promptene er for vage -- de beskriver "aviation dashboard" uten å forklare hva AviSafe faktisk ser ut som.

### Hva jeg observerte i appen

Fra screenshots av den faktiske appen:
- **Login**: Fjellbakgrunn med tåke/skyer, glassmorfisme-kort, diamantformet logo
- **Dashboard**: Fjellbakgrunn, glassmorfisme-kort med nyheter, ressursstatus (fargekodet grønn/gul/rød), dokumentliste, aktive flyvninger, hendelser, søkefelt
- **Kart**: Fullskjerm Leaflet-kart med fargede luftromssoner (rosa, oransje, gul, blå), SafeSky trafikkdata, fly/helikopter-ikoner
- **Oppdrag**: Oppdragskort med statusbadges (Planlagt, Godkjent, SORA), lokasjon, personell/droner/utstyr, drone-vær
- **Ressurser**: Tre-kolonners layout med droner, utstyr og personell med statusindikator (grønn/gul/rød)
- **Hendelser**: Hendelsesliste med ECCAIRS-rapportering, kategoribadges
- **Kalender**: Månedsoversikt med fargekodede hendelsestyper
- **Dokumenter**: Dokumentliste med kategoribadges (Regelverk, Rapporter, Oppdrag, etc.)
- **Statistikk**: KPI-kort (oppdrag, flyvetimer, hendelsesfrekvens), linjediagrammer, kakediagrammer

### Plan

**Fil: `supabase/functions/marketing-visual/index.ts`**

1. **Omskrive `AVISAFE_BRAND_RULES`** med detaljert beskrivelse av faktisk visuell identitet:
   - Fjellbakgrunn med tåke/skyer (som login/dashboard)
   - Glassmorfisme-kort med backdrop-blur
   - Dark navy header (#1a2332) med hvit AviSafe-logo
   - Diamantformet AviSafe-logo ikon
   - Fargekodet statusindikering: grønn (OK), gul (varsel), rød (kritisk)
   - Kart-sentrisk design med luftromssoner

2. **Beskrive faktiske AviSafe-funksjoner** i promptene:
   - Interaktivt luftromskart med fargede soner (rosa/oransje/gul/blå polygoner)
   - Oppdragsplanlegging med SORA-risikoanalyse
   - Drone-flåtestyring med vedlikeholdsstatus
   - Hendelsesrapportering med ECCAIRS-integrasjon
   - Flylogging med DJI-synkronisering
   - Værvurdering for droneflyvning

3. **Legge til app-screenshots som referansebilder** -- sende de faktiske public URLs til kartet og dashboardet som image_url inputs til AI-en, så den kan se hva AviSafe faktisk ser ut som

4. **Legge til strengere "NEVER DO"-regler**:
   - Aldri generiske analytics-dashboards med bar-charts som hovedelement
   - Aldri bright corporate blue (#0066FF) -- AviSafe bruker dypt navy
   - Aldri cartoon-droner eller stock-foto-estetikk
   - Aldri invent UI-elementer som ikke finnes i AviSafe
   - Aldri "Silicon Valley startup"-estetikk -- dette er norsk luftfart/B2B

5. **Deploy** edge function

### Referansebilder som sendes til AI-en
Publiserte app-sider som kan brukes som URL-referanser:
- Logo: `https://avisafev2.lovable.app/avisafe-logo-text.png`
- Login-bakgrunn (tilgjengelig som asset): bruker fjellmotivet allerede i appen

For product mockups og screenshot layouts, inkludere ekstra instruksjoner om at AviSafe sitt UI alltid har:
- Mørk navy header med hvit logo øverst
- Glassmorfisme bakgrunn med fjellmotiv
- Kart med fargede polygoner som hovedelement (ikke tabeller/grafer)

