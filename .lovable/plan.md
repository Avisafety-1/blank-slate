## Endring
Skjul "Legg til nyhet"-knappen i `src/components/dashboard/NewsSection.tsx` for brukere uten admin-rolle. Bruk `isAdmin` fra `useAuth()` (som allerede inkluderer `administrator`, `admin` og `superadmin`).

- Hent `isAdmin` fra `useAuth()`.
- Render `<Button>` (linje 101–108) bare når `isAdmin === true`.

Ingen DB-/RLS-endringer i denne omgangen — eksisterende RLS på `news`-tabellen håndhever allerede tillatelser på serversiden.