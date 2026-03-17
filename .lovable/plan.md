

## Problem

OpenAIP-luftromsdata (P/R/D-soner, RMZ/ATZ/TIZ etc.) laster tregt på `/kart`. Dataen hentes fra Supabase-databasen (`aip_restriction_zones`), ikke fra OpenAIP API i sanntid. To sannsynlige årsaker:

1. **Stale token (samme problem som SafeSky)**: `aip_restriction_zones` har RLS-policy `TO authenticated`. Når JWT-tokenet i localStorage er utløpt, feiler spørringen stille — Supabase returnerer tom data eller feil. `getUser()` er aldri kalt før disse spørringene, så tokenet refreshes ikke.

2. **Sekvensiell lasting**: Alle data-lag (NSM, RPAS, AIP, RMZ/ATZ, hindringer, flyplasser, dronetelemetri, oppdrag, advisories, pilotposisjoner) fyres av som individuelle async-kall uten `await`, men nettleseren har begrenset antall samtidige HTTP-tilkoblinger per domene (~6). Med 10+ kall til samme Supabase-endepunkt kan det oppstå kø.

## Plan

### 1. Sikre gyldig token før kartdata-henting

**Fil: `src/components/OpenAIPMap.tsx`**

Legg til et `await supabase.auth.getUser()` kall **før** alle data-fetcherne (linje ~551). Dette tvinger en token-refresh om nødvendig, slik at alle etterfølgende Supabase-kall bruker et gyldig JWT.

```typescript
// Ensure valid auth token before fetching RLS-protected data
await supabase.auth.getUser();

// Then fetch all data layers
fetchNsmData(...);
fetchAipRestrictionZones(...);
// etc.
```

### 2. Batch AIP-spørringene til én enkelt query

**Fil: `src/lib/mapDataFetchers.ts`**

I dag gjøres to separate spørringer mot `aip_restriction_zones`:
- `fetchAipRestrictionZones`: `.in('zone_type', ['P', 'R', 'D'])`
- `fetchRmzTmzAtzZones`: `.in('zone_type', ['RMZ', 'TMZ', 'ATZ', 'CTR', 'TIZ'])`

Slå disse sammen til én ny funksjon `fetchAllAipZones` som henter **alle** zone_types i én spørring og deretter fordeler dataen til de to lag-gruppene client-side. Dette halverer antall nettverkskall for AIP-data.

| Fil | Endring |
|-----|---------|
| `src/components/OpenAIPMap.tsx` | Legg til `await supabase.auth.getUser()` før data-fetching for å sikre gyldig token |
| `src/lib/mapDataFetchers.ts` | Ny `fetchAllAipZones` som slår sammen de to AIP-spørringene til én |
| `src/components/OpenAIPMap.tsx` | Erstatt separate `fetchAipRestrictionZones` + `fetchRmzTmzAtzZones` med `fetchAllAipZones` |

