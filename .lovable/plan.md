

## Plan: Optimaliser tab-header i RiskAssessmentDialog for mobil og desktop

### Problem
`TabsList` bruker `grid-cols-5` alltid, men «AI SORA»-tabben er betinget (vises kun når `soraOutput` finnes). Når den er skjult er det bare 4 tabs i et 5-kolonners grid — dette skaper tomrom.

### Løsning i `src/components/dashboard/RiskAssessmentDialog.tsx`

**Linje 535**: Endre `grid-cols-5` til dynamisk basert på om `soraOutput` finnes:
```tsx
<TabsList className={cn("grid w-full", soraOutput ? "grid-cols-5" : "grid-cols-4")}>
```

Importer `cn` fra `@/lib/utils` (sannsynligvis allerede importert).

Tabs-triggerne har allerede responsiv tekst (`text-xs sm:text-sm`, skjult/vist tekst). Dette fikser hovedproblemet — at knappene ikke fyller hele linja.

### Fil som endres
- `src/components/dashboard/RiskAssessmentDialog.tsx` (1 linje)

