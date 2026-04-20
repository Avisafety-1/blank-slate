

## Plan: Auto-sync toggle + "Logg ut"-knapp i dialogen

### Problem
1. **Auto-sync vises som "Av" selv om brukeren mener det er på.** Bekreftet i databasen: `dji_credentials.auto_sync_enabled = false` for alle 3 kontoer som bruker `rikardvb@gmail.com`. Årsaken er at avkrysningsboksen for auto-sync KUN vises i den manuelle innloggingsskjemaen og KUN når «Husk innlogging» er huket av (linje 3063-3071 i `UploadDroneLogDialog.tsx`). Når en bruker allerede har lagret innlogging, finnes det ingen måte å skru auto-sync av/på på — de må logge ut og inn igjen, og selv da krever det at de huker av «Husk innlogging» først.
2. Det finnes ingen rask «Logg ut»-knapp på DJI-konto-kortet i metode-steget — kun en blå prikk indikerer at man er innlogget.

### Endringer i `src/components/UploadDroneLogDialog.tsx`

**1. Gjør auto-sync til en alltid-tilgjengelig toggle**
- På metode-steget (under DJI-konto-kortet, linje 2754-2783), når `hasSavedCredentials = true`, vis en `Switch` (av/på) med label «Auto-sync (daglig kl. 03:00)» rett under «Auto-sync: På/Av»-teksten (eller erstatt teksten).
- Ved endring: kall `supabase.from('dji_credentials').update({ auto_sync_enabled: <ny verdi> }).eq('user_id', user.id)`, oppdater lokal `enableAutoSync`-state, vis toast «Auto-sync slått på/av».
- Behold også eksisterende avkrysningsboks i manuelle innloggingsskjemaen (linje 3063-3071) slik at man kan skru på det med én gang ved første innlogging.

**2. Plassering av «Logg ut» og blå prikk på DJI-konto-kortet**
- Flytt den blå prikken (linje 2780) fra `top-2 right-2` til `top-2 left-2`.
- Legg til en liten ikon-knapp (LogOut-ikon, `h-6 w-6`, ghost-variant) i `top-2 right-2`. Klikk stopper propagering (slik at man ikke samtidig åpner DJI-login) og kaller eksisterende `handleDjiLogout()`. Tooltip: «Logg ut av DJI».
- Knappen vises kun når `hasSavedCredentials = true`.

**3. Konsistens-forbedring**
- I `handleDjiLogin` (linje ~941), når brukeren lagrer innlogging UTEN å huke av auto-sync, sørg for at `auto_sync_enabled` eksplisitt settes til `false` (ikke bare hoppes over). Dette forhindrer at gamle verdier henger igjen. (Kan implementeres ved å alltid skrive `auto_sync_enabled: enableAutoSync` ved lagring.)

### Ingen DB-endringer
Kolonnen `auto_sync_enabled` finnes allerede i `dji_credentials`. Ingen migreringer nødvendig.

### Tekniske detaljer
- `Switch`-komponenten (`@/components/ui/switch`) er allerede importert.
- `LogOut`-ikon er allerede importert fra `lucide-react` (linje 17).
- Etter første lasting i `checkSavedCredentials` er `enableAutoSync` allerede synkronisert med DB-verdien (linje 401), så toggle-startverdien er korrekt.
- For superadmin/Avisafe-bruker som ser andre selskaper: oppdateringen filtreres på `user_id = auth.uid()` via RLS (eksisterende policy).

