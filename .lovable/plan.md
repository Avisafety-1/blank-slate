

## Problem
Etter "Oppdater nå" oppdateres deler av appen, men `DroneDetailDialog` viser fortsatt gammel versjon (mangler "teknisk ansvarlig fra delte avdelinger"-endringen).

## Hypotese
Sannsynligvis to ting:

1. **Lazy-loaded chunk er fortsatt cachet i Cache Storage / HTTP cache.** `DroneDetailDialog` lastes trolig som en separat chunk (dynamic import via routing eller Suspense). Hvis precache fra gammel SW serverer den gamle chunk-hashen — eller hvis browser disk-cache returnerer gammel bundle — så får vi gammel komponent selv om `index.html` er fersk.

2. **Den gamle SW-en (uten `SKIP_WAITING`-handler) tok kontroll igjen ved reload** før den nye fikk aktivert seg, fordi `clearAllCaches()` ble kjørt på gammel kode-vei (uten `activateNewSW`). Resultat: nye `index.html` ble lastet, men gamle precachede asset-chunks ble servert fra ny SW som arvet samme precache-manifest, eller browseren brukte memory/disk cache.

3. **Mulig: React Query / komponent-state holder gammel modul i minnet** — usannsynlig etter full `location.replace`, men verdt å bekrefte.

## Utforskning

Trenger å bekrefte:
- Hvordan `DroneDetailDialog` lastes (statisk import vs `lazy()`) → påvirker om den ligger i hovedbundel eller egen chunk
- Om Vite PWA precache inkluderer alle chunks (typisk ja via `__WB_MANIFEST`)
- Om noen sider gjør `import()` til komponenten

## Plan

### Steg 1 — Diagnose (lese-only nå)
- Lese `vite.config.ts` for å bekrefte PWA precache-omfang og om `cleanupOutdatedCaches: true` er satt
- Søke etter hvordan `DroneDetailDialog` importeres (statisk vs dynamisk)
- Lese `src/main.tsx` for SW-registrering og `registerType`

### Steg 2 — Fix (når godkjent)

**A. Sikre at gammel precache slettes ved SW-aktivering**
I `src/sw.ts`: legg til `cleanupOutdatedCaches()` fra `workbox-precaching` slik at gamle precache-buckets fjernes når ny SW aktiveres. Uten dette kan workbox holde flere precache-versjoner samtidig og servere feil chunk.

```ts
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
```

**B. Tving full re-fetch av alle JS/CSS chunks ved reload**
I `clearAllCaches()` i `useForceReload.ts`: i tillegg til `caches.delete`, eksplisitt unregistrere SW og la den nye registrere seg på nytt. Dette er det "atomare" alternativet:

```ts
// Etter caches.delete: avregistrer SW slik at neste navigasjon registrerer fersk
const regs = await navigator.serviceWorker.getRegistrations();
await Promise.all(regs.map(r => r.unregister()));
```

Avveining: brukeren mister offline-cache i ett sekund, men får garantert fersk kode. Egnet for force-reload-flow (engangs).

**C. Bumpe app_version på nytt for å trigge banner**
Kjøre ny migrasjon som setter `app_version = '24'` slik at brukerne som fortsatt sitter på v23 (med ufullstendig fix) får ny reload — denne gangen vil den faktisk dra ned `DroneDetailDialog`-endringen fordi gammel SW blir avregistrert.

**D. Legge til version-query på dynamiske imports (valgfritt, hvis A+B ikke holder)**
Vites hash-baserte filnavn skal i teorien gjøre dette unødvendig — hver kodendring gir ny hash. Hvis chunken faktisk fikk ny hash men gammel SW serverer den fra gammel precache-bucket, løser (A) det. Hvis chunken IKKE fikk ny hash (uvanlig), trenger vi å undersøke build-output.

### Verifisering
1. Etter fix: gjør liten synlig endring i `DroneDetailDialog` (f.eks. ekstra space i en label)
2. Bumpe `app_version`
3. På testbruker (på gammel versjon): banner → "Oppdater nå"
4. Åpne DroneDetailDialog → bekreft endringen synlig
5. DevTools → Application → Service Workers: bekreft at kun én aktiv SW finnes, ingen "waiting"
6. DevTools → Application → Cache Storage: bekreft kun én precache-bucket med ny hash

### Filer
- `src/sw.ts` — `cleanupOutdatedCaches()`
- `src/hooks/useForceReload.ts` — unregister SW i clearAllCaches
- Ny migrasjon — bumpe `app_version` til `'24'`

