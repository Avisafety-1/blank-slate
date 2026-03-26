

## Fix: Gjenopprett SORA-innstillinger ved redigering via navigasjons-state

### Problem
Det finnes to innganger til ruteredigering i `Kart.tsx`:

1. **Fra oppdragsdialogen på kartet** (`handleEditMissionRoute`, linje 178) — her gjenopprettes `soraSettings` korrekt fra `route.soraSettings`
2. **Via navigasjons-state** (useEffect linje 71-87) — her settes `existingRoute` som `currentRoute`, men **soraSettings hentes aldri ut og settes**. Derfor forblir toggle "av".

### Løsning

**Fil: `src/pages/Kart.tsx`**

I useEffect-blokken (linje 71-87), etter `setCurrentRoute(state.existingRoute)` på linje 77, legg til:

```ts
if (state.existingRoute.soraSettings) {
  setSoraSettings(state.existingRoute.soraSettings);
}
```

Dette er 3 linjer kode, ingen andre filer berørt. `existingRoute` er av typen `RouteData` som allerede inneholder `soraSettings?: SoraSettings`.

### Resultat
- Når man navigerer til kartet for å redigere en rute som ble lagret med SORA-buffersoner, vil toggle automatisk stå på "på" og sonene vises
- Panelet forblir lukket (collapsible `open = false`) som ønsket

