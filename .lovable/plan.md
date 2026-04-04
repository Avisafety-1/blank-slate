

## Klikk på oppdragskart → navigér til /kart med ruten vist

### Problem
Når man klikker på minikartet i et oppdragskort åpnes en `ExpandedMapDialog`. Det er begrenset i funksjonalitet sammenlignet med hovedkartet.

### Løsning
Endre klikk-handlingen slik at den navigerer til `/kart` med oppdragets rutedata og posisjon via `location.state`. Legge til en tilbakeknapp på `/kart` som tar brukeren tilbake til det aktuelle oppdragskortet.

### Endringer

**1. `src/components/oppdrag/MissionCard.tsx`**
- Erstatte `onExpandMap(mission)` med `navigate('/kart', { state: { viewMission: mission } })` (bruk `useNavigate`)
- Sende med mission id, koordinater, rute og flight tracks

**2. `src/pages/Kart.tsx`**
- Håndtere ny `viewMission`-state i `location.state`-effekten
- Sette ruten og kartposisjon fra oppdragets data
- Vise en tilbakeknapp (f.eks. øverst til venstre) med tekst «Tilbake til oppdrag» som navigerer til `/oppdrag` med en hash/state som scroller til riktig oppdragskort
- Tilbakeknappen vises kun når man kom fra et oppdrag

**3. `src/pages/Oppdrag.tsx`**
- Håndtere `location.state.scrollToMission` — scrolle til oppdragskortet med matchende id ved oppstart

**4. `src/components/oppdrag/MissionCard.tsx`**
- Legge til `id={mission.id}` på oppdragskortets rot-element for scroll-targeting

### Teknisk flyt
```text
Oppdragskort (klikk kart)
  → navigate('/kart', { state: { viewMission: { id, lat, lng, route, flightTracks } } })
  → Kart.tsx mottar state, viser rute, flight tracks, og tilbakeknapp
  → Tilbakeknapp → navigate('/oppdrag', { state: { scrollToMission: missionId } })
  → Oppdrag.tsx scroller til kortet
```

### Filer som endres
- `src/components/oppdrag/MissionCard.tsx`
- `src/pages/Kart.tsx`
- `src/pages/Oppdrag.tsx`

