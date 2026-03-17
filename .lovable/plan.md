

## Rydd opp gjenværende legacy admin-sjekker

### Bakgrunn
Forrige refaktorering fikset AuthContext og 4 komponenter, men det gjenstår **6 filer** som fortsatt gjør egne `has_role`/`user_roles`-kall med legacy-rollen `'admin'` i stedet for å bruke `useAuth().isAdmin`. Dette betyr at admin-knapper i disse komponentene kan forsvinne for brukere med den nye `'administrator'`-rollen.

### Endringer

**1. Slett død kode**
- `src/hooks/useAdminCheck.ts` — Ingen bruker den lenger. Slett filen.

**2. Bytt 5 komponenter til `useAuth().isAdmin`**
Fjern lokale `has_role` RPC-kall og `user_roles`-queries, bruk `useAuth()` i stedet:

- `src/pages/Kalender.tsx` — Fjern `has_role('admin')`, bruk `isAdmin` fra useAuth
- `src/components/dashboard/CalendarWidget.tsx` — Samme
- `src/components/dashboard/DocumentDetailDialog.tsx` — Samme
- `src/components/dashboard/IncidentDetailDialog.tsx` — Samme
- `src/components/documents/DocumentUploadDialog.tsx` — Fjern `user_roles`-query, bruk `isAdmin` fra useAuth

**3. Fiks Google-registrering**
- `src/pages/Auth.tsx` (linje ~465) — Endre `role: 'admin'` til `role: 'administrator'` ved Google-bruker rolle-insert.

### Risiko
Lav. Alle endringer erstatter duplikate kall med verdier som allerede finnes i AuthContext. Ingen database- eller RLS-endringer.

