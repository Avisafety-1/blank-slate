# Stoppe krasj ved valg av utstyr

## Bekreftet årsak
Utstyrsradene i `LogFlightTimeDialog` har to samtidige klikkbehandlere:

- foreldreraden kaller `toggleEquipment(...)` via `onClick`
- Radix-checkboxen kaller samme funksjon via `onCheckedChange`

Checkboxen ligger inne i dialogens `<form>`. Radix oppretter derfor et skjult input og sender et klikk som bobler til foreldreraden når den kontrollerte verdien endres. Foreldreraden endrer verdien på nytt, og dette fortsetter til React kaster `Maximum update depth exceeded`. Stackens `setRef`/`safelyDetachRef` er en følge av denne remount-løkken, ikke selve årsaken.

Dette samsvarer direkte med Radix UI-feilrapport #2549 for kontrollert Checkbox i et skjema med state-endrende `onClick` på forelderen.

## Endring
1. Fjerne `onClick` fra foreldreraden, slik at bare checkboxen styrer tilstanden.
2. Gjøre hele utstyrsraden til en semantisk `<label>` rundt checkboxen, slik at brukeren fortsatt kan trykke hvor som helst på raden.
3. Erstatte «toggle uten hensyn til ny verdi» med eksplisitt oppdatering basert på `onCheckedChange(checked)`. Dermed legges ID-en til ved `true` og fjernes ved `false`, uten dobbel invertering.
4. Beholde dagens ekspanderbare, scrollbare utstyrsliste uendret.

## Avgrensning
- Kun utstyrsvalget i «Avslutt flytur»-dialogen endres.
- Ingen endringer i database, RLS, lagring, dronevalg, pilotvalg eller andre ressursregler.
- Den delte Checkbox-komponenten endres ikke, så andre skjemaer påvirkes ikke.

## Verifisering
- Åpne «Avslutt flytur», utvide utstyrslisten og velge/velge bort flere elementer via både checkbox og radtekst.
- Kontrollere at hvert trykk endrer antallet nøyaktig én gang, at listen fortsatt kan scrolles, og at dialogen ikke krasjer.
- Kontrollere at innsending fortsatt lagrer valgte utstyrs-ID-er som før.
