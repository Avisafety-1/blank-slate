## Plan: 2D/3D-toggle synlig også under ruteplanlegging

### Bakgrunn
- `Kart.tsx` har allerede `is3D`-toggle, men knappen vises kun når `!isRoutePlanning`. I ruteplanleggings­modus er den skjult både i 2D og 3D.
- Ruta (`currentRoute`) og SORA-innstillingene er allerede løftet til `Kart` og sendes som `controlledRoute` / `soraSettings` til både `OpenAIPMap` (2D) og `Map3D` (3D). Buffersonene gjenoppbygges automatisk fra disse i begge kartene. Ingen ekstra state-deling trengs.
- Befolkningstetthet beregnes i dag i 2D-kartet (via `mergedDensityCells` / `soraDensityResult` propsene til `OpenAIPMap`) og er ikke implementert i `Map3D`. Det er ønsket adferd å la 2D fortsette å gjøre dette.

### Endring (kun `src/pages/Kart.tsx`, rundt linje 1068)

Fjern guarden som skjuler 2D/3D-knappen i ruteplanlegging:

- Endre `const toggle3DBtn = !isRoutePlanning ? (...) : null;` til alltid å rendre knappen (`const toggle3DBtn = (...);`).
- La `routePlannerBtn3D` beholde dagens guard (`is3D && !isRoutePlanning`) — den skal fortsatt kun vises som en startknapp før ruteplanlegging er aktiv.

Resultat:
- Bruker kan nå klikke 2D/3D-ikonet midt i ruteplanlegging og bytte frem og tilbake.
- `currentRoute` + `soraSettings` følger automatisk med, så ruta, FG/Cont/GRB-sonene og SORA-konfig forblir intakt i overgangen.
- Befolkningstetthet kjører som før kun i 2D-kartet; 3D-kartet trenger ingen egen tetthetsberegning.

### Ingen øvrige filer berøres
`Map3D.tsx`, `OpenAIPMap` og SORA-flyt er uendret.
