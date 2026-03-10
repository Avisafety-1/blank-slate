

## Plan: Anonymiser pilotnavn ved live-publisering

### Problem
Når en flytur startes med «live»-modus, lagres pilotens fulle navn i `pilot_name`-feltet og vises offentlig på kartet og i aktive flyvninger-seksjonen.

### Løsning
Endre `StartFlightDialog.tsx` til å lagre «Pilot» (eller bare fornavn) + selskapsnavn i stedet for fullt navn når publish-modus er live.

### Endringer

**`src/components/StartFlightDialog.tsx`**
- I `fetchPilotName` (linje 472-482): hent også selskapsnavn (allerede tilgjengelig via `useAuth`-konteksten som `companyName`)
- Endre `pilot`-verdien som sendes til `onStart` (linje 644 og 680): når `publishMode` er `'live_uav'` eller `'advisory'`, bruk `"Pilot – {companyName}"` i stedet for fullt navn
- Preview-teksten (linje 998-1001) viser fortsatt fullt navn lokalt — dette er kun synlig for brukeren selv

**Ingen andre filer endres** — `pilot_name`-feltet i databasen vil automatisk inneholde den anonymiserte verdien, og kart-popup og aktive flyvninger-seksjonen viser det som er lagret.

### Resultat
- Kartet viser: «Pilot – Firmanavn AS»
- Aktive flyvninger (intern): viser `profileName` (fullt navn) som fallback for eget selskap, men `pilot_name` lagret i DB er anonymisert
- Flyloggen beholder fullt navn via `profile_id`-relasjonen

