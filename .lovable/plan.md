

# Prognose-funksjon pa vaerkortet i /oppdrag

## Hva er situasjonen?

Vaerkortet (DroneWeatherPanel) brukes i to moduser:
- **Compact** (brukt pa /oppdrag): Viser kun navarende vaer + en forenklet 12-timers tidslinje
- **Full** (brukt i MissionDetailDialog): Viser to faner -- "Na" med detaljerte vaerdata og "Prognose 24t" med full tidslinje, beste flyvindu, og utfyllende informasjon

Pa /oppdrag brukes `compact` modus, som betyr at brukerne mangler den fullstendige prognose-fanen med 24-timers oversikt.

## Hva endres?

En enkel endring: Fjern `compact`-proppen fra DroneWeatherPanel-bruken i Oppdrag.tsx. Da far oppdragskortene den fulle tabbede visningen med:

- **Na-fane**: Vind, temperatur, nedbor, fuktighet + vaeradvarsler
- **Prognose 24t-fane**: Full 24-timers tidslinje med fargekodede blokker, beste flyvindu-markering, og detaljert tooltip per time

## Hva pavirkes IKKE

- DroneWeatherPanel-komponenten endres ikke
- Ingen andre sider pavirkes
- Historisk vaerdata for fullforte oppdrag fungerer som for
- Ingen database- eller API-endringer

## Teknisk detalj

**Fil:** `src/pages/Oppdrag.tsx`

Endring pa linje 1698-1703: Fjern `compact`-proppen.

```text
// For:
<DroneWeatherPanel
  latitude={effectiveLat}
  longitude={effectiveLng}
  compact
  savedWeatherData={...}
/>

// Etter:
<DroneWeatherPanel
  latitude={effectiveLat}
  longitude={effectiveLng}
  savedWeatherData={...}
/>
```

