## Inspeksjons-modus i ruteplanleggeren

Legger til en ny meny-knapp (musepeker-ikon) i ruteplanlegger-kontrollene som lar brukeren midlertidig klikke i kartet (på geo-soner, etc.) uten å legge ned rutepunkter.

### `src/pages/Kart.tsx`
- Ny state `routeInspectMode: boolean` (default `false`).
- Ny knapp plassert sammen med øvrige meny-knapper (undo / clear / cancel / save) i begge layoutene (desktop ~linje 720 og mobil ~linje 890), med `MousePointer2`-ikon fra `lucide-react`. Aktiv tilstand markeres visuelt (samme stil som andre toggle-knapper).
- Toggle nullstilles automatisk når `isRoutePlanning` blir `false` (ved Avbryt/Lagre).
- Send `routeInspectMode` videre til `<OpenAIPMap />` (og `<Map3D />` om relevant).

### `src/components/OpenAIPMap.tsx`
- Ny prop `routeInspectMode?: boolean` + tilhørende `inspectModeRef` som oppdateres i en `useEffect`.
- I `handleMapClick` (linje 970): hvis `modeRef.current === "routePlanning"` OG `inspectModeRef.current === true`, returner uten å pushe rutepunkt — slik at popup-handlere på underliggende GeoJSON-lag (verneområder, CTR, NOTAM, m.fl.) får håndtere klikket normalt.
- Endre kart-cursor i ruteplanlegging fra `crosshair` til `default`/`pointer` når inspect-modus er aktiv (CSS-klasse på map-containeren toggles).

### Adferd
- I inspect-modus: ingen nye rutepunkter, eksisterende rute beholdes, drag/slett av eksisterende punkter fungerer som før, alle øvrige knapper fungerer som før.
- Klikk på en geo-sone åpner sonens popup som vanlig.
- Knappen er kun synlig mens `isRoutePlanning` er aktiv.
