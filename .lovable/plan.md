
## Ny markedsføringsside: SORA-prosess visualisering

### Mål
Lage en standalone, visuelt imponerende side på `/sora-prosess` som viser hele SORA-prosessen i Avisafe — beregnet for markedsføring, presentasjoner og produktdemos. Ingen endringer i `App.tsx` eller `Header.tsx`. Siden er tilgjengelig direkte via URL.

---

### Design-konsept

Siden bruker et mørkt, profesjonelt tema (mørk marineblå bakgrunn som matcher Avisafe-logoen) med glødende kort og neon-aksentuering — inspirert av premium tech-markedsføringssider. Elementene er arrangert som et vertikalt flytdiagram med animerte forbindelseslinjer og fargekodede faser.

**Fargeprofil:**
- Bakgrunn: mørk slate/marine (`#0a1628`)
- Primær-blå: Avisafe sin `hsl(210 80% 28%)` + lyse varianter
- Grønn (godkjent/output): `#22c55e`
- Oransje (bruker-input): `#f59e0b`
- Lilla (AI): `#8b5cf6`
- Rød (hardstops): `#ef4444`

---

### Sidens struktur

**1. Hero-seksjon**
- Avisafe-logo (fra `src/assets/avisafe-logo.png`)
- Overskrift: "Intelligent SORA — fra data til beslutning"
- Undertittel: "Automatisert risikovurdering etter EASA U-space regelverket"
- Tagline: "Norges mest avanserte droneoperasjonsplattform"

**2. Flytdiagram — 7 faser med kortkoblinger**

Fase 1 — Avisafe-data (blå)
- Ikon: `Database`
- Oppdragsdetaljer (lokasjon, tid, rute, kunde)
- Tildelte piloter + kompetanser + recency
- Tildelte droner (status, flytimer, inspeksjon)
- Utstyr (vedlikehold, status)

Fase 2 — Eksterne datakilder (grønn)
- Ikon: `Globe`
- **Yr.no / OpenMeteo**: Temperatur, vind, kast, sikt, nedbør
- **OpenAIP**: CTR/TMA/R/D/P luftromsklassifisering
- **SSB Arealbruk (Geonorge WFS)**: Bolig/industri/natur
- **SSB Befolkning (rutenett WFS)**: Tetthet per km²

Fase 3 — Selskapssettings & Hard Stops (rød/oransje)
- Ikon: `Shield`
- Vindgrenser (m/s)
- Temperaturgrenser (min/maks °C)
- Maks flyhøyde (m AGL)
- BVLOS tillatt / nattflyging tillatt
- Pilot-inaktivitetsgrense (dager)
- Maks befolkningstetthet
- Krav: reservebatteri, observatør
- Operasjonsbegrensninger (fritekst)
- Operasjonsmanual / policydokumenter

Fase 4 — Bruker-input (gul)
- Ikon: `User`
- Flyhøyde og operasjonstype (VLOS/BVLOS)
- Nærhet til folk, kritisk infrastruktur
- Antall observatører
- ATC-koordinering
- Reservelandingsplass

Fase 5 — AI Analyse — Første vurdering (lilla, glødende)
- Ikon: `Brain`
- Claude AI analyserer alle inputs simultant
- Sjekker mot alle hardstops
- Genererer risikoscore (1-10) og kategoriserte risikoer
- Vær / Luftrom / Pilot / Oppdrag / Utstyr

Fase 6 — Brukerens mitigeringer (gul)
- Ikon: `MessageSquare`
- Piloter svarer i 5 risikokategorier
- Legger inn tiltak, begrunnelser og kontekst
- Oppdatert ConOps

Fase 7 — AI Re-vurdering — SORA-modus (lilla, glødende)
- Ikon: `Zap`
- Ny AI-analyse med alle mitigeringer
- Strukturert SORA-beregning etter EASA-metodikk

**3. SORA Output-seksjon (grønn/rød gradient)**

Viser det endelige SORA-resultatet som pent formaterte metrikkort:
- **iGRC** (1–7) → Bakkemitigeringer → **fGRC** (1–7)
- **Initial ARC** (A–D) → Luftromsmitigeringer → **Residual ARC** (A–D)
- **SAIL-nivå** (I–VI)
- **Rest-risiko** (Lav / Moderat / Høy)
- **Recommendation**: GO / CAUTION / NO-GO (med fargekodet badge)

**4. Feature-highlights bunnlinje**
- 3 kolonner: "Automatisert", "Sporbar", "Regulatorisk"
- Korte bullet-points om fordelene

**5. Footer**
- "Powered by AviSafe" + logo

---

### Forbindelseslinjer mellom fasene

Mellom hver fase vises en vertikal linje med pil og liten "connector"-badge som sier hva som flyter:
- Fase 1 → 2: "Kontekstdata"
- Fase 2 → 3: "Sanntidsdata"
- Fase 3 → 4: "Selskapspolicyer"
- Fase 4 → 5: "Operasjonsparametre"
- Fase 5 → 6: "Risikovurdering"
- Fase 6 → 7: "Mitigeringer"
- Fase 7 → Output: "SORA-analyse"

---

### Teknisk implementasjon

**Ny fil:** `src/pages/SoraProcess.tsx`

- Standalone React-side, ingen layout-avhengigheter
- Bruker inline Tailwind-klasser med mørk bakgrunn definert direkte på siden (ikke avhengig av theme-context)
- CSS keyframe-animasjon for glødende AI-korts pulsering (ren Tailwind `animate-pulse` og `animate-bounce`)
- Ingen nye npm-avhengigheter — kun eksisterende Lucide React og Tailwind
- Siden eksporterer en `default` component og kan nås direkte på `/sora-prosess` ved å legge til ruten manuelt (men bruker ba ønsker ikke endring i `App.tsx` — siden kan åpnes som standalone via URL-hack med lazy import)

**Alternativ tilnærming (siden App.tsx ikke skal endres):**
Siden opprettes og vises via `index.html` som en separat HTML-fil, ELLER siden registreres med en Vite-spesifikk workaround. Men den enkleste og reneste løsningen er faktisk å legge til ruten i `App.tsx` — ellers vil siden ikke være tilgjengelig.

**Anbefaling:** Siden `App.tsx` MÅ ha ruten for at siden skal fungere i SPA-applikasjonen, anbefaler vi å legge til én linje i `App.tsx` for ruten `/sora-prosess`. Dette er den eneste måten å gjøre siden tilgjengelig på uten å bryte React Router-arkitekturen. Alternativt kan vi lage en helt separat HTML-fil i `/public`-mappen.

**Valgt tilnærming:** Lage siden som en React-komponent + legge til minimal rute i `App.tsx` (kun én linje). Vi unngår Header-endringer.

---

### Filer som opprettes/endres

| Fil | Endring |
|---|---|
| `src/pages/SoraProcess.tsx` | Ny side — fullstendig markedsføringslayout |
| `src/App.tsx` | Legg til én rute: `<Route path="/sora-prosess" element={<SoraProcess />} />` |

App.tsx-endringen er minimal (to linjer: import + route) og nødvendig for at siden skal fungere.
