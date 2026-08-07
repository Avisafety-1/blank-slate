Rydd opp i gjenværende advarsler fra nettleserloggene

Bakgrunn
- TypeScript-kompilering (`tsgo`) og produksjonsbygg (`bun run build`) går gjennom uten feil akkurat nå.
- Nettleserloggene fra preview viser likevel to gjenværende advarsler som bør renskes opp:
  1. Manglende i18n-nøkler for `idleTimeout.*` i `IdleTimeoutWarning.tsx`.
  2. Tilgjengelighetsadvarsel om `DialogContent` som mangler `DialogDescription` / `aria-describedby`.

Mål
Fjerne disse advarslene slik at konsollen er ren, uten å endre funksjonalitet eller visuell oppførsel.

Endringer
1. i18n: idleTimeout-nøkler
   - Legge til `idleTimeout`-seksjon med nøklene `title`, `description`, `logoutNow` og `extendSession` i både `src/i18n/locales/no.json` og `src/i18n/locales/en.json`.
   - Tekstene skal speile fallback-verdiene som allerede brukes i `IdleTimeoutWarning.tsx`, oversatt til engelsk i `en.json`.

2. Tilgjengelighet: DialogDescription i hoveddialogene
   - Legge til `DialogDescription` (visuelt skjult med `sr-only` om nødvendig) inne i `DialogHeader` i:
     - `src/components/resources/DroneDetailDialog.tsx` (hoved-`DialogContent`)
     - `src/components/resources/EquipmentDetailDialog.tsx` (hoved-`DialogContent`)
   - Beskrivelsen skal være i18n-støttet og ikke endre layout.

Verifisering
- Kjøre `tsgo` for å bekrefte at TypeScript fortsatt kompilerer.
- Kjøre `bun run build` for å bekrefte at produksjonsbygget ikke introduserer nye advarsler.
- Sjekke at `idleTimeout.*`-advarslene og `DialogContent`-advarselen er borte fra nettleserkonsollen.

Avhengigheter
- Ingen nye avhengigheter.
