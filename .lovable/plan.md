

## Dokumenter vises ikke på /dokumenter etter opprettelse

### Årsak

Dette er **ikke** et rolleproblem, men et **caching-problem** med React Query.

**Hvordan det fungerer nå:**
- React Query har `staleTime: 5 min` og `gcTime: 24 timer` med localStorage-persistering
- Dashboard-widgeten bruker egen `useState` + realtime — ser nye dokumenter umiddelbart
- `/dokumenter`-siden bruker `useQuery` med queryKey `["documents", companyId]`
- Når brukeren oppretter en risikovurdering-PDF og deretter navigerer til `/dokumenter`, serverer React Query den cachede (ferske) versjonen uten å hente på nytt

**Flyt som feiler:**
1. Bruker besøker `/dokumenter` → data caches
2. Bruker går til oppdrag, oppretter risikovurdering-PDF → ny rad i `documents`-tabellen
3. Bruker navigerer tilbake til `/dokumenter` innen 5 min → React Query anser data som fersk, viser gammel cache
4. Realtime-subscription aktiveres først etter mount, men dataen er allerede servert fra cache

### Løsning

To endringer:

**1. `/dokumenter`-siden: Alltid refetch ved mount**
- `src/pages/Documents.tsx` — Legg til `refetchOnMount: 'always'` i useQuery-opsjoner, slik at data alltid hentes på nytt når siden vises

**2. Risikovurdering-eksport: Invalider documents-query etter insert**
- `src/lib/riskAssessmentPdfExport.ts` brukes som en ren funksjon uten tilgang til queryClient, så koden som kaller den må invalidere
- Finn alle steder som kaller `exportRiskAssessmentPDF` og legg til `queryClient.invalidateQueries({ queryKey: ["documents"] })` etter vellykket eksport

**3. Andre steder som inserter dokumenter uten å invalidere:**
- `src/pages/Status.tsx` (CSV-eksport) — samme problem, legge til invalidering
- `src/components/FlightLogbookDialog.tsx` (loggbok-eksport) — samme

### Risiko
Svært lav. Ingen logikk- eller RLS-endringer. Bare cache-invalidering og refetch-strategi.

