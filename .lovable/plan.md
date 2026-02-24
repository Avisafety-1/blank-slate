

# Fiks DJI-innlogging: Bedre feilhåndtering og logging

## Problem
Brukeren logger inn med riktige DJI-credentials (fh.dji.com), men får "Ingen konto-ID mottatt". Koden forventer `data.result.accountId` fra DroneLog API, men logger ikke hva som faktisk returneres -- så vi vet ikke om responsformatet er annerledes.

## Endringer

### 1. Edge function: Legg til logging og fleksibel respons-parsing (`process-dronelog/index.ts`)

- Legg til `console.log` for DJI-login responsen slik at vi kan se nøyaktig hva DroneLog returnerer
- Håndter tilfeller der `accountId` kan ligge på ulike steder i responsen (f.eks. `data.accountId`, `data.result.accountId`, eller `data.result`)
- Returner hele rå-responsen til frontend slik at vi kan se den i feilmeldingen

### 2. Frontend: Bedre accountId-ekstraksjon (`UploadDroneLogDialog.tsx`)

- Sjekk flere mulige steder for accountId i responsen: `data.result?.accountId`, `data.accountId`, `data.result` (hvis result er en string)
- Vis hele API-responsen i feilmeldingen slik at brukeren (og vi) kan se hva som returneres

### Filer som endres
1. `supabase/functions/process-dronelog/index.ts` -- Logging + raw response forwarding
2. `src/components/UploadDroneLogDialog.tsx` -- Fleksibel accountId-parsing + bedre feilmelding
