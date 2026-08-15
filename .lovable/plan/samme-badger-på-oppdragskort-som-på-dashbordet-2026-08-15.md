# Samme badger på oppdragskort som på dashbordet

## Problem

Dashbordets oppdragsliste og oppdragskortene på /oppdrag (samt oppdrags-dialogen) rendrer badgene hver for seg med litt ulike regler:

| Badge | Dashbord | Oppdragskort /oppdrag | Oppdragsdialog |
| --- | --- | --- | --- |
| Status | ja | ja | ja |
| Godkjenning | ja | ja | ja |
| AI-risiko | **alltid** (grå "Risiko"-badge når analysen mangler, klikkbar for å starte analyse) | kun når analyse finnes | kun når analyse finnes |
| SORA | farget etter status | uten farge | farget |
| Sjekkliste | ja | ja | nei |
| NOTAM | ja | ja | ja |
| Ninox (5 km) | nei | ja | nei |

Derfor mangler f.eks. AI-risikoscore på oppdragskortet/dialogen når analysen ikke er kjørt ennå (som i skjermbildet).

## Løsning

Lag én felles badge-rad som brukes alle tre stedene, slik at samme sett med badger alltid vises.

- Ny komponent `src/components/oppdrag/MissionBadgeRow.tsx` som rendrer: status, godkjenning, AI-risiko, SORA, sjekkliste, NOTAM og Ninox (5 km) — hver med sin eksisterende klikk-handling sendt inn som callback.
- AI-risiko vises **alltid**: viser `AI: <anbefaling> (score)` når analysen finnes, ellers en nøytral grå "Risiko"-badge som åpner risikodialogen for å kjøre analysen (samme oppførsel som på dashbordet).
- SORA-badgen bruker `getSoraBadgeColor()` overalt.
- Badger som ikke er relevante for en flate (f.eks. Ninox uten 5 km-sone, sjekkliste uten sjekklister) skjules automatisk basert på data — ikke basert på hvilken flate den står i.
- Størrelse styres av en `size`-prop (`compact` for dashbordlisten, `default` for kort og dialog), slik at det visuelle uttrykket på dashbordet beholdes.

## Teknisk

- Felles logikk og farger ligger allerede i `src/lib/oppdragHelpers.ts`; `shouldShowAIRiskBadge` erstattes/utfases der AI-badgen alltid skal vises.
- Flatene som byttes om til å bruke `MissionBadgeRow`:
  - `src/components/dashboard/MissionsSection.tsx`
  - `src/components/oppdrag/MissionCard.tsx`
  - `src/components/dashboard/MissionDetailDialog.tsx`
- Dialogen og oppdragskortet må få tilgang til sjekkliste- og Ninox-data de allerede henter (ingen nye spørringer mot databasen forventes; der data mangler i dialogen brukes eksisterende `currentMission`-felter).
- Alle tekster via `t()`, nye nøkler legges i både `no.json` og `en.json` (bl.a. placeholder-teksten for AI-risiko).
