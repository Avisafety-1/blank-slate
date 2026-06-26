## Endringer

### 1. `src/pages/Kart.tsx` — "Tilbake til oppdrag"-knapp
Når `editingMissionId` er satt (dvs. man kom fra et oppdragskort via `?missionId=`), vis en ny knapp i topp-bar/route-planning-baren ved siden av "Lagre":

- **Tekst:** "Tilbake til oppdrag" (med ArrowLeft-ikon)
- **Handling:** `navigate('/oppdrag', { state: { missionId: editingMissionId, scrollToMission: true } })`
- Skal IKKE vises når man tegner ny rute (`editingMissionId === null`).

### 2. `src/pages/Kart.tsx` — Endre "Lagre" for eksisterende oppdrag
I `handleSaveRoute`, i grenen `if (editingMissionId)` (linje 354–374):

- Behold lagring av rute til DB og success-toast.
- **Fjern** `setIsRoutePlanning(false)`, `setEditingMissionId(null)` og reset av `currentRoute` / `pilotPosition` / `soraSettings`.
- Brukeren blir værende i route-planning-modus med oppdraget/ruten synlig og redigerbar.

Lagre-flyten for **nye** ruter (`routePlanningState` eller `/kart`-start) er uendret — dialogen åpnes som før.

### 3. `src/pages/Oppdrag.tsx` — Scroll til valgt oppdrag
Utvid eksisterende `useEffect` (rundt linje 132) som leser `location.state.missionId`:

- Når `state.scrollToMission` er sant, etter at missions er lastet, finn DOM-elementet for kortet (`document.getElementById('mission-card-' + missionId)` eller `data-mission-id`-selector) og kall `scrollIntoView({ behavior: 'smooth', block: 'center' })`.
- Tøm `location.state` etter scroll så refresh ikke re-triggrer.

### 4. `src/components/oppdrag/MissionCard.tsx` — id på kort-roten
Legg til `id={`mission-card-${mission.id}`}` (eller `data-mission-id`) på rot-`Card`-elementet for at scroll skal kunne treffe det.

## Berørte filer
- `src/pages/Kart.tsx`
- `src/pages/Oppdrag.tsx`
- `src/components/oppdrag/MissionCard.tsx`
