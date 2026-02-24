

# Implementer: Kart på oppdragskort + nedsampling av flyspor

## Endringer i `src/components/UploadDroneLogDialog.tsx`

### 1. Nedsampling av flyspor (linje 315)

Erstatt:
```typescript
const flightTrack = result.positions.map(p => ({ lat: p.lat, lng: p.lng, alt: p.alt, timestamp: p.timestamp }));
```

Med:
```typescript
const rawTrack = result.positions.map(p => ({ lat: p.lat, lng: p.lng, alt: p.alt, timestamp: p.timestamp }));
const maxPoints = 200;
let flightTrack = rawTrack;
if (rawTrack.length > maxPoints) {
  const step = Math.ceil(rawTrack.length / maxPoints);
  flightTrack = rawTrack.filter((_, i) => i % step === 0 || i === rawTrack.length - 1);
}
```

### 2. Legg til latitude/longitude i missions-insert (linje 319-325)

Legg til to nye felter i insert-objektet, etter `beskrivelse`-linjen:
```typescript
latitude: result.startPosition?.lat ?? null,
longitude: result.startPosition?.lng ?? null,
```

Dette gjør at:
- Flyspor begrenses til maks ~200 punkter (ned fra 2000+)
- Kartet vises på oppdragskortet fordi `latitude`/`longitude` nå settes fra DJI-loggens startposisjon

