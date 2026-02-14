
# Fullskjerm kart og hoydeprofil uten rammer

## Hva endres
Dialogen for utvidet kart skal bruke hele skjermen mer effektivt, spesielt pa mobil:

1. **Fjern rammer og padding rundt kartet** - Kartet fyller hele bredden uten `m-4`, `rounded-lg` og `border`
2. **Fjern rammer rundt hoydeprofilen** - Hoydeprofilen vises rett under kartet uten ekstra padding, border og margin
3. **Minimal avstand mellom kart og hoydeprofil** - Fjern gap/margin mellom de to seksjonene
4. **Header mer kompakt** - Reduser padding pa header
5. **Footer mer kompakt** - Statistikk-linjen far mindre padding

## Tekniske detaljer

### Fil: `src/components/dashboard/ExpandedMapDialog.tsx`

Endringer i JSX-layouten (linje 564-633):

- `DialogContent`: Beholder `p-0`, oker hoyde til `h-[90vh]` pa mobil
- **Kart-container** (linje 574-576): Fjern `m-4 mt-0 rounded-lg border border-border`, bruk bare `flex-1 relative min-h-0`
- **Hoydeprofil** (linje 578-587): Fjern `mx-4 rounded-lg border border-border p-3`, bruk `px-2 py-1` for minimal padding
- Fjern "Hoydeprofil"-labelen for a spare plass
- **Footer** (linje 589): Reduser fra `p-4 pt-2` til `px-2 py-1`
- **Header** (linje 570): Reduser fra `p-4 pb-2` til `px-3 py-2`
