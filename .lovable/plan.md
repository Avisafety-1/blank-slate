

## Fix: Kompetansekort og skjema flyter ut av skjermen på mobil

### Problem
Kompetansekortene og "Legg til kompetanse"-skjemaet i PersonCompetencyDialog er for brede på mobil. Hovedårsakene er:

1. **ScrollArea-viewport tillater horisontal scrolling** -- Radix ScrollArea sin viewport har `overflow: auto`, som lar innholdet utvide seg horisontalt i stedet for å begrenses
2. **Dato-feltene i "Legg til"-skjemaet** bruker `grid-cols-2` uten `min-w-0` på barna, noe som gjor at date-inputs kan presse innholdet bredere enn skjermen
3. **Manglende bredde-begrensninger** på skjema-containeren og kompetansekort-seksjonen

### Losning

**Fil: `src/components/ui/scroll-area.tsx`**
- Legg til `overflow-x-hidden` pa ScrollArea Viewport slik at horisontalt innhold alltid klippes, ikke scrolles

**Fil: `src/components/resources/PersonCompetencyDialog.tsx`**
- Legg til `min-w-0` pa "Legg til kompetanse"-skjemaets container (`border-t pt-4 mt-4`)
- Legg til `min-w-0` pa dato-grid-barna i bade "legg til"- og "rediger"-seksjonene
- Endre dato-grid i "legg til"-skjemaet fra `grid-cols-2` til `grid-cols-1 sm:grid-cols-2` for a stable pa sma skjermer (konsistent med redigeringsmodus som allerede gjor dette)
- Legg til `overflow-hidden` pa form-elementet

### Tekniske detaljer

Endring i `scroll-area.tsx` (linje 14):
```
// Fra:
<ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit] overflow-auto">

// Til:
<ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit] overflow-auto overflow-x-hidden">
```

Endringer i `PersonCompetencyDialog.tsx`:
- Linje 465: Legg til `min-w-0 overflow-hidden` pa form-wrapperen
- Linje 467: Legg til `min-w-0` pa form-elementet  
- Linje 509: Endre `grid-cols-2` til `grid-cols-1 sm:grid-cols-2` for dato-feltene
- Linje 510, 520: Legg til `min-w-0` pa grid-barna

