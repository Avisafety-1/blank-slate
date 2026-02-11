

# Importer nye datalag fra OpenAIP (uten duplikater) ✅ FERDIG

## Implementert

### Database
- ✅ `openaip_obstacles` tabell med RLS og spatial indeks
- ✅ `check_mission_airspace` utvidet med RMZ/TMZ/ATZ-sjekker
- ✅ Cron-jobb for daglig sync av hindringer (kl 03:10 UTC)

### Edge Functions
- ✅ `sync-openaip-airspaces` utvidet med type 8 (RMZ), 9 (TMZ), 13 (ATZ)
- ✅ `sync-openaip-obstacles` ny funksjon – synker 1505 hindringer fra Norge

### Kart
- ✅ OpenAIPMap.tsx – nye kartlag for RMZ/TMZ/ATZ og hindringer med egne farger
- ✅ MapLayerControl.tsx – toggle for nye lag
- ✅ MissionMapPreview.tsx – viser RMZ/TMZ/ATZ soner
- ✅ ExpandedMapDialog.tsx – viser RMZ/TMZ/ATZ soner

### Merknader
- Norge har per nå ingen RMZ/TMZ/ATZ i OpenAIP-databasen, men koden er klar for når de legges til
- 1505 hindringer (piper, master, kabler m.m.) synkronisert
- Hindringer-laget er av som standard (kan slås på i kartlag-panelet)
