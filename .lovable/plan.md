

## Problem
"Send oppdateringssignal" trigger reload, men brukerne får fortsatt gammel JS/CSS. Endringer i f.eks. `DroneDetailDialog` vises ikke selv etter klikk på "Oppdater nå".

## Hypoteser

1. **Service worker serverer cachet `index.html`** → samme hash-baserte JS-filer lastes på nytt fra cache. `clearAllCaches()` sletter Cache Storage *før* reload, men hvis SW har `skipWaiting` ikke aktivert, vil den gamle SW fortsatt kontrollere siden ved reload og re-cache umiddelbart.

2. **`window.location.reload()` bruker cache** → bør være `reload(true)` (deprecated) eller bedre: navigere til URL med cache-buster.

3. **Vite PWA `injectManifest` med precache** → precachede assets (hashede JS-bundles) serveres fra Cache Storage. Når SW oppdateres må den ta kontroll (`clients.claim()`) ellers fortsetter gammel SW å servere gamle assets.

4. **Browser HTTP-cache på `index.html`** → hvis serveren ikke setter `Cache-Control: no-cache` på index.html, henter browseren samme HTML med samme asset-referanser.

## Utforskning nødvendig

Lese:
- `src/sw.ts` — sjekke `skipWaiting`/`clients.claim`, precache-strategi, hvordan oppdatering håndteres
- `vite.config.ts` — PWA-konfig (registerType, injectManifest options)
- `index.html` — meta cache-control tags
- `src/hooks/useForceReload.ts` — reload-flyt (allerede sett, men verifisere rekkefølge)

## Forventet løsning

**Tre-lags fix:**

1. **SW må aktivere ny versjon før reload**
   - Etter `reg.update()`, vent på `installing`/`waiting` worker
   - Send `SKIP_WAITING`-melding til waiting worker
   - Vent på `controllerchange`-event før reload
   - Slik blir den nye SW-en aktiv *før* siden lastes på nytt → den serverer nye assets

2. **Hard reload med cache-buster**
   - Bruk `window.location.href = window.location.pathname + '?v=' + Date.now()` i stedet for `reload()`
   - Tvinger ny HTTP-request, omgår browser-cache for index.html

3. **Verifisere at SW har `self.skipWaiting()` + `clients.claim()`**
   - Hvis ikke: legge til i `src/sw.ts`

## Plan

### Endringer

**`src/hooks/useForceReload.ts`** — endre `clearAllCaches()` + `performReload()`:
```ts
async function activateNewSW() {
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg) return;
  await reg.update();
  
  // Hvis det finnes en waiting worker, be den ta over
  const waiting = reg.waiting;
  if (waiting) {
    return new Promise<void>((resolve) => {
      const onChange = () => {
        navigator.serviceWorker.removeEventListener('controllerchange', onChange);
        resolve();
      };
      navigator.serviceWorker.addEventListener('controllerchange', onChange);
      waiting.postMessage({ type: 'SKIP_WAITING' });
      // Timeout etter 3s for å unngå hang
      setTimeout(resolve, 3000);
    });
  }
}

export async function performReload() {
  // ... sync queue, persist version (uendret)
  await clearAllCaches();
  await activateNewSW();           // ← ny: vent på ny SW
  // Cache-buster URL i stedet for reload()
  const url = new URL(window.location.href);
  url.searchParams.set('_v', Date.now().toString());
  window.location.replace(url.toString());
}
```

**`src/sw.ts`** — verifisere/legge til:
```ts
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
```
(legges kun til hvis ikke allerede tilstede — utforsker først)

**`index.html`** — verifisere at det ikke ligger aggressiv caching i meta. Vurdere å legge til:
```html
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
```
på index.html (ikke på assets).

### Verifisering
1. Gjør en synlig endring i `DroneDetailDialog` (f.eks. label-tekst)
2. Klikk "Send oppdateringssignal" som superadmin
3. Banner vises hos testbruker → klikk "Oppdater nå"
4. Bekreft at endringen vises umiddelbart uten manuell hard-refresh
5. Test både i vanlig browser og som installert PWA

### Filer
- `src/hooks/useForceReload.ts` (kjernefiks)
- `src/sw.ts` (legg til SKIP_WAITING + clients.claim hvis mangler)
- `index.html` (cache-control meta hvis nødvendig)

