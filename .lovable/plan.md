

## Fix: Ikke lagre nåværende vær for oppdrag med gammel dato

### Problem
Når et oppdrag med gammel `tidspunkt` (f.eks. fra en importert DJI-logg) fullføres, henter systemet **nåværende vær** fra MET API og lagrer det som snapshot. Dette er misvisende — det viser dagens vær, ikke været da flyvningen faktisk skjedde.

### Løsning
Sjekk om oppdragets `tidspunkt` er mer enn 24 timer gammelt. Hvis ja: **ikke hent vær**, og lagr i stedet en markør som sier at historisk vær ikke er tilgjengelig.

MET sitt historisk-API (`frost.met.no`) krever egen registrering og har andre datastrukturer, så den enkleste og ærligste løsningen er å vise "Værdata ikke tilgjengelig for historiske oppdrag".

### Endringer

#### 1. `src/components/dashboard/AddMissionDialog.tsx`
I weather-snapshot-blokken (~linje 420-444): legg til sjekk før `drone-weather`-kallet:
```ts
const missionTime = new Date(formData.tidspunkt);
const hoursAgo = (Date.now() - missionTime.getTime()) / (1000 * 60 * 60);
if (hoursAgo > 24) {
  weatherSnapshot = {
    captured_at: new Date().toISOString(),
    unavailable: true,
    reason: 'historical',
  };
} else {
  // eksisterende drone-weather fetch
}
```

#### 2. `src/components/dashboard/MissionStatusDropdown.tsx`
Samme sjekk (~linje 49): trenger `tidspunkt` som prop. Legg til `tidspunkt?: string` i props, og sjekk alder før fetch.

#### 3. `supabase/functions/auto-complete-missions/index.ts`
Samme logikk: sjekk om `tidspunkt` er > 24 timer gammelt før weather-fetch. Missions som auto-fullføres er per definisjon > 24t gamle, så **hele weather-fetch-blokken kan droppes** her og erstattes med `unavailable: true`.

#### 4. `src/components/DroneWeatherPanel.tsx`
Håndter `unavailable`-flagget i saved weather data: vis "Værdata ikke tilgjengelig for dette oppdraget" i stedet for å prøve å rendre manglende data.

### Filer som endres
1. `src/components/dashboard/AddMissionDialog.tsx` — sjekk alder før weather-fetch
2. `src/components/dashboard/MissionStatusDropdown.tsx` — legg til `tidspunkt`-prop + alderssjekk
3. `supabase/functions/auto-complete-missions/index.ts` — fjern weather-fetch, sett `unavailable: true`
4. `src/components/DroneWeatherPanel.tsx` — vis melding for utilgjengelig vær

### Bonus-effekt
`auto-complete-missions` vil ikke lenger gjøre N eksterne HTTP-kall til MET API, noe som reduserer edge function-kjøretid og risiko for timeout.

