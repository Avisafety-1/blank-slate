

## Analyse

Tre problemer i nåværende `src/sw.ts`:
1. `createHandlerBoundToURL('/index.html')` server precached HTML → gamle sider etter deploy.
2. `activate`-handleren wiper ALLE caches (også den nye precachen som nettopp ble installert) → ødelegger Workbox sin egen versjonering.
3. Ingen `controllerchange`-lytter på klientsiden → bruker må manuelt reloade.

Ingen Supabase/API-caching i dag — bra, beholdes slik.

## Endringer

**`src/sw.ts`**
- Fjern `createHandlerBoundToURL` + `NavigationRoute`-blokken.
- Legg til `NetworkFirst`-route for `request.mode === 'navigate'` med `cacheName: 'html-cache'` og `networkTimeoutSeconds: 2`.
- Importer og kall `cleanupOutdatedCaches()` fra `workbox-precaching` (rett etter `precacheAndRoute`).
- Fjern `caches.keys()...delete`-loopen i `activate`. Behold `skipWaiting()` i install og `clients.claim()` i activate.
- Behold push/notification-handlere uendret.

**`src/main.tsx`**
- Legg til en `controllerchange`-lytter som kaller `window.location.reload()` én gang (guard mot reload-loop med en lokal flagg).

**`src/hooks/useForceReload.ts`** (relatert hygiene)
- `clearAllCaches()` sletter i dag alle Cache Storage-keys ved manuell "Oppdater nå". Behold for manuell flow (brukerinitiert), men la den naturlige SW-oppdateringen håndtere normalfall — ingen endring nødvendig her.

## Resultat
- Navigasjoner går alltid mot nett først (2s timeout → fallback til cache offline).
- Statisk JS/CSS/bilder fortsatt precached og raske.
- Ingen Supabase-caching (uendret).
- Ny SW → automatisk reload via `controllerchange`.

## Filer som endres
- `src/sw.ts`
- `src/main.tsx`

