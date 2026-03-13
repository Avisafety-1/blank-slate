
Mest sannsynlige rotårsak er funnet i edge-funksjonen, ikke i UI:

1) `admin-delete-user` sjekker `requesterRoles.has("admin")`, men aktiv rolle i systemet er primært `administrator`.
2) Da får admin-brukere 403 fra funksjonen, og i UI vises kun generisk toast: **“Error deleting user”**.
3) Dette forklarer at sletting fortsatt feiler selv etter FK-migrasjonene.

Plan for implementering:

1. Oppdater autorisering i `supabase/functions/admin-delete-user/index.ts`
- Bytt rollelogikk til å godta både `administrator` og legacy `admin` (samt `superadmin`).
- Helst bruk `has_role(..., 'administrator')` + `has_role(..., 'superadmin')` for konsistent server-side rollehierarki.

2. Legg inn eksplisitt regel for målbruker
- Hvis requester ikke er superadmin: blokkér sletting av målbruker som har `superadmin`.
- Tillat sletting av `administrator` og `bruker` i samme selskap.

3. Stram opp feilhåndtering i edge-funksjonen
- Sjekk og håndter `error` fra kritiske operasjoner (`user_roles` delete, `profiles` delete, osv.) i stedet for å anta suksess.
- Returnér tydelig feilmelding med `stage` (f.eks. `authorization`, `profile_delete`, `auth_delete`) for raskere debugging.

4. Forbedre feilsynlighet i `src/pages/Admin.tsx`
- Les `error.context` / respons-body fra `supabase.functions.invoke(...)` og vis konkret melding i toast/logg (ikke bare generisk).
- Dette gjør at vi umiddelbart ser om feilen er “Forbidden” vs. “FK constraint”.

5. Verifisering (E2E)
- Testmatrise:
  - Administrator sletter bruker i eget selskap → skal lykkes
  - Administrator sletter administrator i eget selskap → skal lykkes
  - Administrator prøver å slette superadmin → skal avvises
  - Superadmin sletter bruker/admin → skal lykkes
- Sjekk edge-function logs for hver case for å bekrefte riktig `stage` og statuskode.

Tekniske detaljer:
- Filer:  
  - `supabase/functions/admin-delete-user/index.ts` (hovedfiks)  
  - `src/pages/Admin.tsx` (bedre feilmelding i UI)
- Ingen ny migrasjon trengs for denne konkrete feilen før vi har kjørt overstående autoriseringsfiks og verifisert responskoder.
