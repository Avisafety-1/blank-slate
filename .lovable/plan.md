
## Korrigere regulatorisk tekst på /sora-prosess

### Problem
Markedsføringssiden bruker "EASA U-space" feil 4 steder. U-space (EU 2021/664) er et separat digitalt luftrom-regime for UTM/UAS-trafikkstyring. Avisafe implementerer SORA — Specific Operations Risk Assessment — som er EASA sin metodikk for risikovurdering i «Specific»-kategorien.

### Korrekte begrep å bruke
- ❌ "EASA U-space regelverket" → ✅ "EASA SORA-metodikken"
- ❌ "EASA U-space · AI-drevet · SORA-sertifisert" → ✅ "EASA SORA · AI-drevet · AMC 1 AMC1 UAS.STS"
- ❌ "EASA JO-3.1" (finnes ikke) → ✅ "EASA SORA-metodikk"
- ❌ "U-space regelverkssamsvar" → ✅ "SORA-metodikk for Specific-kategori"
- ❌ "Norske myndighetskrav ivaretatt" → ✅ "Norske CAA-krav ivaretatt" (Luftfartstilsynet)

### Alle steder i SoraProcess.tsx som endres

**Linje ~201:** (hero-badge)
- Fra: `EASA U-space · AI-drevet · SORA-sertifisert`
- Til: `EASA SORA · AI-drevet · Specific-kategori`

**Linje ~219:** (hero-undertittel)
- Fra: `Automatisert risikovurdering etter EASA U-space regelverket`
- Til: `Automatisert risikovurdering etter EASA SORA-metodikken`

**Linje ~374:** (Fase 7 subtitle)
- Fra: `Strukturert SORA-beregning etter EASA JO-3.1`
- Til: `Strukturert SORA-beregning etter EASA SORA AMC-rammeverket`

**Linje ~418:** (output-header)
- Fra: `Komplett SORA-rapport etter EASA JO-3.1 metodikk`
- Til: `Komplett SORA-rapport etter EASA SORA-metodikken`

**Linje ~560:** (feature-highlight, "Regulatorisk klar")
- Fra: `U-space regelverkssamsvar`
- Til: `SORA-metodikk for Specific-kategori`

**Linje ~607:** (footer)
- Fra: `Powered by AviSafe · EASA SORA · AI-drevet droneoperasjonsplattform`
- Til beholdes nesten likt, men EASA SORA er korrekt her — ingen endring nødvendig

### Kun én fil endres
`src/pages/SoraProcess.tsx` — 5 tekstjusteringer, ingen strukturelle endringer.
