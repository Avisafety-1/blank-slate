## Problem

Når man trykker "Vis på kart" på en aktiv flytur, navigeres man til `/kart` med `location.state.focusFlightId`. Hensikten er at kartet skal sentreres rundt flyturen, ikke rundt brukerens GPS-posisjon. Likevel hopper kartet til GPS-posisjonen.

## Årsak

I `src/components/OpenAIPMap.tsx` setter init-effekten opp et `navigator.geolocation.getCurrentPosition`-kall (linje 687–711). Callbacken sjekker `if (!focusFlightId)` for å avgjøre om den skal sentrere på GPS — men `focusFlightId` her er **fanget i closure** ved tidspunktet kartet initialiseres.

Tidslinjen ved klikk på "Vis på kart":
1. `KartPage` monteres med `focusFlightId === null` (initial state).
2. `OpenAIPMap` init-effekten kjører umiddelbart → starter `getCurrentPosition` med `focusFlightId === null` i closure.
3. `useEffect([location.state])` i `Kart.tsx` kjører og kaller `setFocusFlightId(state.focusFlightId)`.
4. Geolocation-callbacken fyrer asynkront (typisk 100–1500 ms senere) — den ser fortsatt `focusFlightId === null` (stale closure) → kjører `map.setView(coords, 9)` og hopper til brukerens GPS.
5. Focus-effekten (linje 970–1003) prøver etter 1500 ms å sentrere på flyturen, men hvis geolocation-callbacken kommer etter den, vinner geolocation likevel.

## Løsning

Bruk en ref for `focusFlightId` slik at geolocation-callbacken alltid leser oppdatert verdi, og ikke overstyrer kartet hvis en flytur skal være i fokus.

### Endringer i `src/components/OpenAIPMap.tsx`

1. Legg til en ref som holdes synkronisert med `focusFlightId`:
   ```ts
   const focusFlightIdRef = useRef<string | null>(focusFlightId ?? null);
   useEffect(() => { focusFlightIdRef.current = focusFlightId ?? null; }, [focusFlightId]);
   ```

2. I geolocation-callbackene (linje 700 og 706), bytt `if (!focusFlightId)` med `if (!focusFlightIdRef.current)` — både i success- og error-callbacken.

3. Som ekstra sikkerhet: fjern den fastlagte 1500 ms forsinkelsen i focus-effekten (linje 973). Bruk i stedet en kort `setTimeout(..., 100)` + en retry hvis markøren ikke finnes (allerede dekket av Supabase-fallback). Dette gjør at sentrering på flyturen skjer raskt etter mount, slik at brukeren ikke ser GPS-hoppet selv ved cachet posisjon.

Ingen endringer trengs i `Kart.tsx` eller `ActiveFlightsSection.tsx`.

## Verifisering

- Klikk "Vis på kart" på en aktiv flytur fra dashboard → kartet skal åpne sentrert på flyturen, uten å hoppe til GPS-posisjon.
- Åpne `/kart` direkte (uten focusFlightId) → kartet skal fortsatt sentrere på GPS som før.
- Nekt geolokasjon + åpne med focusFlightId → kartet skal vise flyturen, ikke companyLat/companyLon.
