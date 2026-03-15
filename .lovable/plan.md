

## Plan: Vis funksjoner men blokker med oppgraderingsmelding

Istedenfor å skjule navigasjonslenker og komponenter for begrensede planer, skal alt forbli synlig. Brukere som klikker på en begrenset funksjon ser en upgrade-prompt.

### Endringer

**1. `src/components/Header.tsx`**
- Fjern alle `canAccess`-betingelser som skjuler navigasjonslenker (Hendelser, Status, Admin)
- Alle lenker vises alltid — rutebeskyttelsen i App.tsx håndterer blokkeringen når brukeren navigerer dit

**2. `src/components/dashboard/AISearchBar.tsx`**
- Fjern `if (!canAccess('ai_search')) return null;`
- Vis søkefeltet, men vis en upgrade-melding (toast eller inline) når Starter-brukere prøver å søke

**3. `src/components/dashboard/RiskAssessmentDialog.tsx`**
- Behold eksisterende toast-blokkering ved klikk (allerede riktig oppførsel — viser knappen men blokkerer handlingen)

**4. `src/App.tsx`**
- Ruter wrappet med `PlanRestricted` forblir som de er — dette viser allerede en upgrade-prompt med lås-ikon og oppgraderingsknapp når brukeren navigerer til en begrenset side

Ingen nye filer. Kun fjerning av skjulingslogikk i Header og AISearchBar.

