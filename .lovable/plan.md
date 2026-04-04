

## Åpne kart i popup i stedet for navigering

### Problem
Klikk på minikartet i oppdragskortet navigerer nå til `/kart`, som krever tilbakeknapp og mister kontekst. Brukeren ønsker en popup som kan lukkes direkte.

### Løsning
Det finnes allerede en `ExpandedMapDialog`-komponent som gjør akkurat dette — viser et fullskjerm-kart i en dialog med rute, flight tracks, SORA-soner og terrengprofil. Vi trenger bare å koble den opp igjen fra `MissionCard`.

### Endringer

**1. `src/components/oppdrag/MissionCard.tsx`**
- Erstatt `navigate('/kart', { state: { viewMission: mission } })` med en lokal state `expandedMapOpen` som åpner `ExpandedMapDialog`
- Importér og rendér `ExpandedMapDialog` inne i kortet med mission-data (koordinater, rute, flight tracks, tittel, missionId)

**2. `src/pages/Kart.tsx`**
- Fjern `viewMission`-state og tilbakeknapp-logikken (linje ~500-520) da den ikke lenger brukes fra oppdragskort

**3. `src/pages/Oppdrag.tsx`**
- Fjern `scrollToMission`-logikken i `useEffect` da den ikke lenger trengs

### Resultat
Klikk på minikartet åpner en fullskjerm-dialog med alle kartfunksjoner. Lukk dialogen → tilbake til oppdragskortet umiddelbart.

### Filer som endres
- `src/components/oppdrag/MissionCard.tsx`
- `src/pages/Kart.tsx`
- `src/pages/Oppdrag.tsx`

