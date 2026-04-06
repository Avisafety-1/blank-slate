

## Intern kartvisning for flyturer med SafeSky «av» + sikkerhetsfix

### Problem
1. Når `publish_mode = 'none'` lagres ingen posisjonsdata — flyturen er usynlig på kartet, selv for eget selskap
2. **Sikkerhetssvakhet (error)**: RLS-policyen på `active_flights` bruker `auth.uid() IS NOT NULL`, som eksponerer ALLE selskapers aktive flyturer (pilotnavn, GPS-koordinater, rutedata) til alle autentiserte brukere

### Løsning

#### 1. Database-migrasjon — RLS-policy fix

Erstatt den åpne SELECT-policyen med en selskaps-scoped policy som også tillater SafeSky-publiserte flyturer å være synlige for alle (for luftromsdekonflikt):

```sql
DROP POLICY "Authenticated users can view all active flights" ON active_flights;

CREATE POLICY "Company-scoped active flights visibility"
  ON active_flights FOR SELECT TO authenticated
  USING (
    company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
    OR publish_mode IN ('advisory', 'live_uav')
  );
```

Flyturer med `publish_mode = 'none'` er KUN synlige for eget selskap/avdelinger. Flyturer med SafeSky-publisering er synlige for alle autentiserte brukere (nødvendig for luftromsikkerhet).

**Viktig**: Kolonner som `route_data`, `start_lat`, `start_lng` og `pilot_name` eksponeres kun til eget selskap for `none`-flyturer. For advisory/live_uav er dette akseptabelt da formålet er luftromsdekonflikt.

#### 2. Frontend — `useFlightTimer.ts`

Når `publishMode === 'none'`, lagre GPS-startposisjon i `active_flights` (som allerede gjøres for `live_uav`). Kall `startGpsWatch()` også for `none`-modus slik at pilotens posisjon oppdateres.

#### 3. Frontend — `mapDataFetchers.ts`

**`fetchPilotPositions`**: Utvid filteret til å inkludere `publish_mode = 'none'` i tillegg til `live_uav`. Marker `none`-flyturer med en annen farge/ikon (f.eks. grå i stedet for blå) og label «Intern flytur» i stedet for «Pilot (live posisjon)».

**`fetchActiveAdvisories`**: Ingen endring nødvendig — advisory-flyturer fungerer allerede.

#### 4. Frontend — `ActiveFlightsSection.tsx`

Allerede selskaps-scoped i frontend-koden. Ingen endring nødvendig — RLS-endringen beskytter dataene på databasenivå.

#### 5. Frontend — `StartFlightDialog.tsx`

I trafikk-sjekken (linje 426-465): Filteret som skipper `publish_mode === 'none'` flyturer bør oppdateres til å inkludere `none`-flyturer fra eget selskap som nærliggende trafikk.

#### 6. Sikkerhetsvarsel-oppdatering

Etter implementering, slett security finding `active_flights_all_companies` da den er løst.

### Filer som endres
- **Database-migrasjon**: Ny RLS-policy på `active_flights`
- `src/hooks/useFlightTimer.ts` — GPS-tracking for `none`-modus
- `src/lib/mapDataFetchers.ts` — Vis `none`-flyturer internt
- `src/components/StartFlightDialog.tsx` — Inkluder interne flyturer i trafikk-sjekk

