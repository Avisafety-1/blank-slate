## Plan: «Alle» / «Mine» faner på Kommende oppdrag-widget

Endre `src/components/dashboard/MissionsSection.tsx`:

1. Legg til `Tabs` (shadcn) i header-raden, plassert ved siden av tittel/knapper — to triggers: «Mine» (default) og «Alle».
2. Ny state `missionFilter: 'mine' | 'all'` = `'mine'`.
3. Hent innlogget bruker via `useAuth().user.id`.
4. Etter `fetchMissions`, hent også koblinger i `mission_personnel` for de hentede `missionIds` der `user_id = currentUserId`, og lagre i et `Set<string>` (`myMissionIds`).
   - Real-time: re-fetch dette settet sammen med eksisterende `missions`-listener.
5. Filtrer listen som rendres:
   - `all` → som i dag.
   - `mine` → kun missions hvor `id ∈ myMissionIds`.
6. Tom-tilstand i «Mine»: tekst «Ingen oppdrag tildelt deg» (i18n-nøkkel `dashboard.missions.noMyMissions`).
7. Vis count i fane-label: «Mine (N)» / «Alle (M)».

Ingen DB-endringer. `mission_personnel.user_id` finnes allerede og brukes til samme filtrering andre steder (RLS gir tilgang for tildelte brukere).

Layout: kompakt `TabsList` under header-raden så plus/risk-knappene beholder plassen sin.
