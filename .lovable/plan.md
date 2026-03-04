

## Legg til X-knapp på internt søk

**Fil: `src/components/dashboard/AISearchBar.tsx`**

Legg til samme sticky X-knapp (som allerede finnes på regelverks-chatten) øverst til høyre i internal results GlassCard. Knappen kaller `setResults(null)` for å lukke resultatpanelet. Wrapper innholdet i en scrollbar div med sticky X-knapp, identisk mønster som regulations-chatten.

