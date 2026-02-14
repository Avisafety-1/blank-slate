

# Fiks: Terrengdata blokkeres av rate-limiting (HTTP 429)

## Problem
Open-Meteo Elevation API returnerer HTTP 429 (Too Many Requests) pa alle forsporslere. Gjeldende retry-logikk venter for kort (1-2 sek) og har ingen pause mellom batcher, sa rate-limiten aldri rekker a nullstilles.

## Losning

### 1. Downsample flyspor-posisjoner for terreng
144 posisjoner gir 2 API-kall. Mange av posisjonene ligger svart nart hverandre. Ved a downsample til maks ~80 posisjoner (en batch) reduseres antall API-kall til 1, og resultatene interpoleres tilbake.

**Fil:** `src/lib/terrainElevation.ts`
- Ny funksjon `downsamplePositions(positions, maxPoints)` som velger jevnt fordelte posisjoner
- Ny funksjon `interpolateElevations(sampledElevations, sampledIndices, totalLength)` som fyller inn mellomverdier

### 2. Lengre ventetid mellom batcher og retries
Oke retry-delay til eksponentiell backoff: 3s, 6s, 12s. Legg til 1.5s pause mellom hvert batch-kall (selv ved suksess).

**Fil:** `src/lib/terrainElevation.ts`
- Endre `delay(1000 * attempt)` til `delay(3000 * (2 ** attempt))` i retry-lokken
- Legg til `await delay(1500)` mellom batcher (etter suksess)

### 3. Cache terrengdata i minnet
Nar terrengdata er hentet, lagre det i en sessionStorage-cache med en nokkel basert pa flyspor-ID. Neste gang dialogen apnes, bruk cachen i stedet for a hente pa nytt.

**Fil:** `src/components/dashboard/ExpandedMapDialog.tsx`
- For terreng-fetchen starter: sjekk om data finnes i sessionStorage
- Etter vellykket henting: lagre i sessionStorage
- Cache-nokkel: hash av forste og siste posisjon + antall posisjoner

### 4. Oke top-level retries og ventetid
I ExpandedMapDialog sin terreng-effekt: ok top-level retry fra 2 til 3 forsok med 4 sekunders pause.

**Fil:** `src/components/dashboard/ExpandedMapDialog.tsx`
- Endre `for (let attempt = 0; attempt < 2; ...)` til `attempt < 3`
- Endre `setTimeout(r, 2000)` til `setTimeout(r, 4000)`

## Tekniske detaljer

### Endring i `src/lib/terrainElevation.ts`:

```text
Ny eksportert funksjon:
  downsamplePositions(positions, maxPoints = 80)
    -> returnerer { sampled: positions[], indices: number[] }

Ny eksportert funksjon:
  interpolateElevations(elevations, indices, totalCount)
    -> returnerer (number|null)[] med interpolerte verdier

fetchTerrainElevations:
  - retry delay: 3000 * 2^attempt (3s, 6s, 12s)
  - mellom-batch delay: 1500ms
```

### Endring i `src/components/dashboard/ExpandedMapDialog.tsx`:

```text
Terreng-effekten (linje 79-113):
  1. Generer cache-nokkel fra forste/siste posisjon
  2. Sjekk sessionStorage for cached data
  3. Hvis cache hit -> bruk direkte, hopp over API
  4. Hvis cache miss -> downsample, fetch, interpoler, lagre i cache
  5. Top-level retry: 3 forsok med 4s mellomrom
```

## Resultat
- Typisk 1 API-kall i stedet for 2+ (under rate-limit-terskel)
- Lengre backoff gir API-en tid til a nullstille rate-limiten
- Caching forhindrer gjentatte kall nar dialogen apnes pa nytt
- Terrengprofil og AGL vises stabilt
