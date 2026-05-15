## To fix

1. **SafeSky kan ikke skrus av i «Start flytur»**
   - I `src/components/StartFlightDialog.tsx` (linjer 665–671) tvinger en `useEffect` `publishMode` tilbake til `'advisory'` så snart oppdraget har en rute. Når brukeren velger «Ingen», kjøres effekten umiddelbart og overstyrer valget — det er derfor det ikke går an å skru av.
   - Initial `useState` (linje 85) starter også på `'advisory'` istedenfor `'none'`.

   **Endring:** Spore om brukeren har gjort et eksplisitt valg (f.eks. `userPickedMode` ref/state satt i `onValueChange` på `RadioGroup`). Effekten skal kun:
   - tvinge `'none'` når rute mangler (advisory krever rute), og
   - foreslå `'advisory'` som standard kun ved første lasting/oppdragsbytte når brukeren ikke har valgt selv.
   Ved nullstilling i close-effekten (linje 400) settes `userPickedMode` tilbake til false.

2. **Blank språk-knapp i mobil header**
   - I `src/components/Header.tsx` (linjer 171–178) er mobile «Language toggle»-knappen tom — `<Globe />`-ikonet og språkkoden mangler i barn-elementene (desktop-varianten på linje 247–255 har `<Globe />`).

   **Endring:** Legge inn `<Globe className="w-3.5 h-3.5" />` (samme størrelse som de andre mobil-ikonene) inne i knappen.

## Berørte filer

- `src/components/StartFlightDialog.tsx` — endre default publishMode + auto-bytte-effekten til å respektere brukerens valg.
- `src/components/Header.tsx` — fylle inn Globe-ikonet i mobil språkknapp.

Ingen backend-endringer.
