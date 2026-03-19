

## Plan: Ikke sentrer kartet på GPS når focusFlightId er satt

### Problemet
Når bruker klikker "Vis posisjon" på et aktivt oppdrag fra dashbordet, navigeres det til `/kart` med `focusFlightId` i state. Kartet kjører da to ting parallelt:
1. **Geolocation** (linje 438): Sentrerer kartet på brukerens GPS-posisjon
2. **focusFlight** (linje 617): Sentrerer kartet på flightens posisjon etter 1.5s delay

GPS-sentreringen skjer først, og flight-fokuset kommer etter — men det er en visuell konflikt og kartet hopper.

### Løsningen
Hopp over GPS-sentrering (`map.setView`) hvis `focusFlightId` er satt. GPS-markøren kan fortsatt vises, men kartet skal ikke paneres dit.

### Fil som endres

**`src/components/OpenAIPMap.tsx`** — linje 437-458

Endre geolocation-blokken til å sjekke `focusFlightId`:

```typescript
if (!initialCenter && navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
      // Vis markør uansett
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng(coords);
      } else {
        userMarkerRef.current = L.circleMarker(coords, { ... }).addTo(map);
      }
      // Bare sentrer kartet hvis vi IKKE har en flight å fokusere på
      if (!focusFlightId) {
        map.setView(coords, 9);
      }
    },
    () => {
      if (!focusFlightId && companyLat && companyLon) {
        map.setView([companyLat, companyLon], 10);
      }
    },
  );
}
```

Én endring, én fil. Kartet vil nå kun sentreres på GPS når det ikke er et aktivt oppdrag som skal fokuseres.

