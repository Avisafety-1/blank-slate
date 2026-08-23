# Plan: Fiks TypeScript-feil i `src/App.tsx`

## Bakgrunn
`src/App.tsx` har to TypeScript-feil på linje 208–209 fordi `screen.orientation.lock()` ikke er deklarert i TypeScripts standard DOM-typer. Feilen er ikke blokkerende for Vite-bygg, men gir røde markeringer i editoren/typecheck.

## Hva som skal gjøres
1. **Legg til module-augmentation for `ScreenOrientation.lock`**
   - Opprett `src/types/screen-orientation.d.ts` (eller utvid `src/vite-env.d.ts`) med:
     ```ts
     declare global {
       interface ScreenOrientation {
         lock(orientation: OrientationLockType): Promise<void>;
       }
     }
     export {};
     ```
2. **Behold runtime-oppførselen**
   - Ikke endre logikken i `App.tsx`. `?.lock`-sjekken og `.catch(() => {})` beholdes for sikker fallback på enheter uten støtte.
3. **Verifiser**
   - Kjør `bunx tsc --noEmit` (eller tilsvarende typecheck) og bekreft at feilene i `App.tsx` forsvinner.
   - Sjekk at ingen andre typefeil introduseres.

## Ikke i scope
- Endre portrettlås-logikk, PWA-innstillinger eller andre deler av `App.tsx`.
- Løse advarsler om manglende i18n-nøkler (f.eks. `missions.missionTypes.Opplæring`) — det er en separat sak.
