## Mål
"Utvid"-knappen i oppdragskortet/oppdragsdialogen skal åpne `/kart` (samme fane) med valgt oppdrag forhåndslastet, ruten + SORA-buffer synlig, og kartet zoomet til rutens bounds. Alle vanlige kartlag (NOTAM, AIP, vær, befolkning, SafeSky, DroneTag, naturvern, kraftlinjer osv.) er da tilgjengelige som på `/kart`.

Mini-kartet i oppdragskortet beholdes som det er (lett preview). Kun "Utvid"-handlingen endres — `ExpandedMapDialog` brukes ikke lenger fra oppdragsflyten.

## Endringer

### 1. `src/pages/Kart.tsx`
- Les `missionId` fra `useSearchParams()`.
- Når kart-instans er klar og `missionId` er satt:
  - Hent oppdraget (`missions` + relasjoner som allerede brukes andre steder, inkl. route og sora_settings).
  - Sett `editingMissionId` slik at eksisterende rute-/SORA-render-pipeline tar over (samme kodebane som når man redigerer et oppdrag fra Kart).
  - `fitBounds` til rutens koordinater (med litt padding).
  - Fjern `missionId` fra URL etter første last (`navigate('/kart', { replace: true })`) så refresh ikke re-trigger.
- Hvis oppdrag ikke finnes / ingen rute: vis en toast ("Oppdraget har ingen lagret rute") og ikke endre kart-tilstand.

### 2. `src/components/oppdrag/MissionCard.tsx` og `src/components/oppdrag/dialogs/OppdragDialogs.tsx`
- Erstatt `setExpandedMapOpen(true)` / `setExpandedMapMission(mission)` med `navigate('/kart?missionId=' + mission.id)`.
- Fjern lokal `expandedMapOpen` state og `<ExpandedMapDialog>`-bruk i begge filer (sammen med tilhørende imports og prop-drilling for `expandedMapMission` / `setExpandedMapMission`).
- Hvis oppdraget åpnes fra en dialog (`MissionDetailDialog`/`OppdragDialogs`), lukk dialogen før navigasjon så brukeren ser kartet umiddelbart.

### 3. Behold som er
- Mini-kartet (`MissionMapPreview` eller tilsvarende inni kortet) endres ikke — det er bevisst lett.
- `ExpandedMapDialog`-komponenten kan stå urørt foreløpig (brukes evt. andre steder); vi fjerner kun bruken fra oppdragsflyten. Kan ryddes senere hvis ingen referanser gjenstår.

## Teknisk notat
- Bruker eksisterende rute-render i `Kart.tsx` (ingen ny kart-kode), så alle lag fungerer ut av boksen.
- `replace: true` på URL-cleanup hindrer at "tilbake" går til `/kart?missionId=...` igjen.
- Ingen DB- eller RLS-endringer.
- Tilbake-navigasjon: nettleserens tilbake-knapp tar brukeren tilbake til oppdragslisten/dialog som før.

## Verifisering
- Klikk "Utvid" på et oppdrag med rute → havner på `/kart`, ruten + SORA-buffer synlig, kart zoomet til ruten, lagvelger virker.
- Klikk "Utvid" på oppdrag uten rute → toast, ingen state-endring.
- Refresh på `/kart` etter åpning → ingen re-load av oppdraget (URL er ryddet).
