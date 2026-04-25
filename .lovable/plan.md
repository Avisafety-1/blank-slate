## Funn

Ja — koden har allerede deler av dette, men det vises ikke slik du forventet i metodeboksen:

- `UploadDroneLogDialog.tsx` henter `dji_credentials.auto_sync_enabled` og viser kun tekst: `Auto-sync: På/Av` på DJI-konto-kortet.
- Det finnes `handleDjiLogout()`, men logg-ut-knappen ligger bare inne i DJI-login/loggliste-steget, ikke oppe til høyre på selve DJI-konto-kortet.
- Toggle for auto-sync finnes kun som checkbox når man logger inn manuelt og lagrer innlogging. Etter at innloggingen er lagret, kan brukeren ikke slå auto-sync av/på direkte fra boksen.
- `resetState()` setter `enableAutoSync(false)`, så dialogen kan kort vise feil status før `checkSavedCredentials()` får lastet riktig verdi. Det kan forklare hvorfor boksen oppleves som “tilbakestilt”.

## Plan

### 1. Gjør DJI-konto-kortet til en administrerbar statusboks
I metodevalget (`step === 'method'`) oppdateres DJI-konto-kortet slik at når lagret DJI-innlogging finnes, vises:

- e-post som i dag
- en ekte `Switch` for `Auto-sync`
- en liten logg-ut-knapp øverst til høyre på kortet

Skisse:

```text
DJI-konto                         Logg ut
rikardvb@gmail.com
[ toggle ] Auto-sync: På/Av
```

Kortet skal fortsatt kunne klikkes for å hente logger fra DJI-kontoen, men klikk på toggle/logg-ut skal ikke trigge innlogging/importvisning.

### 2. Legg til egen handler for auto-sync-toggle
Legg til `handleAutoSyncToggle(checked)` i `UploadDroneLogDialog.tsx`:

- oppdater UI optimistisk
- oppdater `dji_credentials.auto_sync_enabled` for innlogget bruker
- vis toast: `Auto-sync aktivert` / `Auto-sync deaktivert`
- rull tilbake UI hvis databaseoppdatering feiler

Dette bruker eksisterende RLS/tilgang for egen `dji_credentials`-rad.

### 3. Ikke nullstill lagret auto-sync-status ved dialog-reset
Endre `resetState()` slik at den ikke setter `enableAutoSync(false)` når dialogen åpnes/resettes. Status skal komme fra `checkSavedCredentials()` og bevares i UI.

### 4. Forbedre lagring ved manuell DJI-login
Når brukeren logger inn og huker av for lagring/auto-sync, send `autoSyncEnabled` direkte til `process-dronelog` sin `dji-save-credentials` action, slik at upsert kan lagre `auto_sync_enabled` samtidig med credentials.

Da slipper vi separat update etterpå og reduserer risiko for at status blir feil.

### 5. Oppdater edge-funksjonen for credentials
I `supabase/functions/process-dronelog/index.ts` endres `dji-save-credentials` til å akseptere `autoSyncEnabled` og lagre dette i `dji_credentials.auto_sync_enabled` ved upsert.

## Filer som endres

- `src/components/UploadDroneLogDialog.tsx`
- `supabase/functions/process-dronelog/index.ts`

## Resultat

- DJI-konto-boksen får tilbake forventet kontrollflate: auto-sync-toggle og logg-ut øverst til høyre.
- Brukeren kan slå auto-sync av/på uten å gå inn i DJI-login-steget.
- UI-statusen blir mer stabil og matcher databasen bedre.