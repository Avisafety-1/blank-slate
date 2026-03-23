

## Plan: Fiks kalender-e-post til å bruke webcal:// for abonnering

### Problem
E-posten sender en `https://` lenke til ICS-feeden. Når brukeren klikker på en `https://`-lenke, laster nettleseren/telefonen ned .ics-filen som en engangsimport i stedet for å opprette et kalenderabonnement. For at kalenderapper skal opprette et abonnement (som oppdateres automatisk), må lenken bruke `webcal://`-protokollen.

### Løsning
Endre e-postmalen i `send-calendar-link/index.ts` til å bruke `webcal://` i hovedknappen ("Abonner på kalender"), mens den beholder `https://`-lenken i "Manuelt oppsett"-seksjonen for brukere som trenger å kopiere URL-en manuelt.

### Endring — `supabase/functions/send-calendar-link/index.ts`

- Lag en `webcalUrl` ved å erstatte `https://` med `webcal://` i `feedUrl`
- Hovedknappen: bruk `webcalUrl` som href, endre tekst til "Abonner på kalender"
- Klikkbar lenke under knappen: vis `webcalUrl`
- Manuelt oppsett-seksjonen: behold den originale `https://` URL-en (for kopiering til kalenderapper som krever manuell URL-innsetting)
- Legg til en kort forklaring om at lenken åpner kalenderappen automatisk

### Filer
- `supabase/functions/send-calendar-link/index.ts` — oppdater e-postmal med webcal://-lenker

