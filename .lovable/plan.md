

## Fix: Nærmeste trafikk viser feil resultat (Supabase 1000-rads grense)

### Rotårsak

Problemet er **Supabase sin standard radgrense på 1000 rader**. Spørringen mot `safesky_beacons` henter alle beacons uten geografisk filter eller limit-override. Når tabellen har >1000 rader, returneres kun de første 1000 (vilkårlig rekkefølge). De nærmere dronene i Trøndelag er sannsynligvis ikke blant disse 1000 radene, mens UAS Voss tilfeldigvis er det.

Skjermbildet bekrefter at HWX148888 (725 ft, UAV) er nær brukeren og under 5000 ft -- den burde absolutt dukke opp.

### Løsning

**`src/components/StartFlightDialog.tsx`** (linje 378-396):

1. **Legg til 20 km bounding box-filter** på `safesky_beacons`-spørringen basert på `gpsPosition`:
```typescript
const delta = 0.18; // ~20 km
const { data: beacons } = await supabase
  .from('safesky_beacons')
  .select('id, callsign, beacon_type, latitude, longitude, altitude')
  .gte('latitude', gpsPosition.lat - delta)
  .lte('latitude', gpsPosition.lat + delta)
  .gte('longitude', gpsPosition.lng - delta)
  .lte('longitude', gpsPosition.lng + delta);
```

2. **20 km avstandsgrense** etter haversine-beregning (linje 446-463):
```typescript
const MAX_DISTANCE_KM = 20;
if (minDist > MAX_DISTANCE_KM) {
  setNearestTraffic(null);
  return;
}
```

3. **Oppdater "ingen trafikk"-tekst** (linje 777) til "Ingen lufttrafikk innen 20 km" for å reflektere den nye grensen.

### Resultat
- Bounding box eliminerer 1000-rads problemet (kun lokale beacons hentes)
- HWX148888 og andre nærliggende droner vil nå korrekt vises som nærmeste trafikk
- UAS Voss (337 km unna) vil aldri returneres fra spørringen
- Bedre ytelse (færre rader overført)

