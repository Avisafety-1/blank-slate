

## Plan: Oppdater /priser med korrekte planbeskrivelser

### Problemer i dag
1. Grower-planen sier "Ubegrenset antall droner" i features-listen, men har `maxDrones: 5`.
2. Drone-begrensningene (1/5/15) vises ikke på prissiden.
3. Ingen informasjon om at SafeSky er inkludert i alle planer.
4. Feature-listene reflekterer ikke de faktiske gating-reglene (f.eks. Starter mangler hendelser/status/AI-søk, Professional har tilgangsstyring).

### Endringer

**1. `src/config/subscriptionPlans.ts`** — Oppdater `features`-arrayen for hver plan:
- **Starter**: Legg til "Maks 1 drone", behold eksisterende, fjern evt. misvisende.
- **Grower**: Endre "Ubegrenset antall droner" → "Opptil 5 droner". Legg til "AI-søk" og "Statuspanel".
- **Professional**: Legg til "Opptil 15 droner", "Tilgangsstyring / roller".

**2. `src/pages/Priser.tsx`** — Legg til SafeSky-banner:
- Under overskriften, legg til en liten informasjonsbanner/badge: "SafeSky kartlag og publisering er tilgjengelig på alle abonnementer".
- Vis `plan.maxDrones` som en liten detalj under prisen i hvert plankort (f.eks. "Maks 1 drone" / "Opptil 5 droner" / "Opptil 15 droner").

### Filer som endres
- `src/config/subscriptionPlans.ts`
- `src/pages/Priser.tsx`

