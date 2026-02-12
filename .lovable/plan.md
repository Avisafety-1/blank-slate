

# Aktive flyturer pa tvers av alle selskaper for Avisafe-superadminer

## Hva endres?

Superadminer i selskapet "Avisafe" far se aktive flyturer fra ALLE selskaper pa dashbordet. Andre brukere og selskaper ser kun sine egne flyturer som i dag. Ved mange samtidige flyturer vises de i en scrollbar ramme.

## Endringer

### Fil: `src/components/dashboard/ActiveFlightsSection.tsx`

1. **Importer `useRoleCheck`** for a sjekke om brukeren er superadmin
2. **Hent `companyName`** fra `useAuth()` for a identifisere Avisafe-selskapet
3. **Betinget query**: Hvis superadmin OG companyName er "Avisafe", hent ALLE aktive flyturer (uten `.eq('company_id', companyId)`). Ellers behold dagens filter.
4. **Legg til selskapsnavn** i `ActiveFlight`-interfacet og vis det pa hvert flyturkort (kun for global visning)
5. **Utvid select-query** til a inkludere `companies:company_id(navn)` for a hente selskapsnavn
6. **Scrollbar ramme** er allerede delvis implementert (`max-h-[250px] overflow-y-auto` pa linje 137). Oker til `max-h-[400px]` for global visning slik at flere flyturer far plass for scrolling aktiveres.

### Detaljerte endringer

**Interface-utvidelse:**
```text
interface ActiveFlight {
  ...eksisterende felter...
  companyName?: string;  // Nytt felt
}
```

**Fetch-logikk:**
```text
const isSuperAdminAvisafe = isSuperAdmin && companyName === 'Avisafe';

let query = supabase
  .from('active_flights')
  .select('id, start_time, publish_mode, pilot_name, mission_id, profile_id, 
           profiles:profile_id(full_name), 
           missions:mission_id(tittel),
           companies:company_id(navn)');  // Nytt join

if (!isSuperAdminAvisafe) {
  query = query.eq('company_id', companyId);
}
```

**Visning av selskapsnavn** (kun nar isSuperAdminAvisafe):
- Vises som en liten tekst under pilotnavn pa hvert kort, f.eks. med et Building-ikon

**Scrollramme:**
- For global visning: `max-h-[400px]` i stedet for `max-h-[250px]`

## Sikkerhet

- RLS pa `active_flights` tillater allerede alle autentiserte brukere a se alle aktive flyturer (`auth.uid() IS NOT NULL`)
- Sjekken for superadmin + Avisafe-selskap er en ekstra frontend-begrensning -- backend-tilgangen er allerede sikret
- Ingen RLS-endringer nodvendig

## Hva pavirkes IKKE

- Andre brukere/selskaper ser kun egne flyturer (uendret)
- Realtime-subscription fungerer som for (lytter allerede pa hele tabellen)
- Kartvisning pavirkes ikke
- MissionDetailDialog pavirkes ikke
