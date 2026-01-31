

# Plan: Feilsøke Push-varsler på Samsung

## Identifiserte problemer

Etter grundig analyse har jeg funnet følgende potensielle årsaker:

### 1. Mulig VAPID-nøkkel mismatch

**Frontend-nøkkel:**
```
BD9yHkTYW7JVOnMJ15jtV7ef6Cfhgw0L4pbhA6Bwx3tzPm37B_FYlzzFfpQY5jxE-pMIAS2fx2HAv9nYUm6eW4U
```

**Backend-nøkkel:** Lagret i Supabase secrets som `VAPID_PUBLIC_KEY`

Disse må være **identiske**. Hvis de ikke matcher, vil FCM akseptere meldingen fra serveren, men nettleseren vil forkaste den fordi signaturen ikke stemmer med abonnementet.

### 2. Service Worker-konflikt

Prosjektet har **to separate service workers**:

| Fil | Formål | Registrert av |
|-----|--------|---------------|
| `sw.js` (generert) | PWA caching via Vite PWA-plugin | Vite automatisk |
| `/sw-push.js` | Push notifications | usePushNotifications hook |

**Problem**: Nettleseren kan ha `sw.js` aktiv i stedet for `sw-push.js`, noe som betyr at push-events aldri mottas.

### 3. Samsung batterioptimalisering

Samsung-enheter har aggressiv batterioptimalisering som ofte blokkerer bakgrunns-push. Du må manuelt unnta Chrome/nettleseren fra "sove-apper".

## Løsning

### Del 1: Verifiser VAPID-nøkkel

Du må manuelt sjekke at VAPID_PUBLIC_KEY i Supabase matcher frontend-nøkkelen:

1. Gå til Supabase Dashboard → Settings → Edge Functions
2. Finn secreten `VAPID_PUBLIC_KEY`
3. Sammenlign med: `BD9yHkTYW7JVOnMJ15jtV7ef6Cfhgw0L4pbhA6Bwx3tzPm37B_FYlzzFfpQY5jxE-pMIAS2fx2HAv9nYUm6eW4U`

Hvis de ikke matcher, må du:
- Enten oppdatere secreten i Supabase til å matche frontend
- Eller oppdatere frontend-koden til å matche secreten

### Del 2: Konsolidere Service Workers

Jeg vil slå sammen push-funksjonaliteten inn i Vite PWA sin service worker slik at det bare er én aktiv service worker.

**Endringer:**

**Fil: `vite.config.ts`**
- Legge til `injectManifest`-modus som lar oss bruke egen service worker-kode
- Importere push-logikken fra `sw-push.js` inn i den genererte service workeren

**Fil: `src/sw.ts` (ny)**
- Kombinert service worker som håndterer både PWA-caching og push notifications

**Fil: `src/hooks/usePushNotifications.ts`**
- Endre til å bruke `navigator.serviceWorker.ready` i stedet for manuell registrering av `/sw-push.js`

### Del 3: Samsung-instruksjoner

For Samsung-enheter må du gjøre følgende:
1. Gå til **Innstillinger → Batteri → Bakgrunnsbruksgrenser**
2. Finn Chrome (eller din nettleser)
3. Fjern den fra listen over "sovende apper"
4. Aktiver "Tillat bakgrunnsaktivitet"

## Tekniske endringer

### Fil: `vite.config.ts`

```typescript
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
  // ... eksisterende konfigurasjon
})
```

### Fil: `src/sw.ts` (ny)

```typescript
/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// PWA Precaching
precacheAndRoute(self.__WB_MANIFEST);

// Push notification handler
self.addEventListener('push', function(event) {
  // ... push-logikk fra sw-push.js
});

self.addEventListener('notificationclick', function(event) {
  // ... click-logikk
});
```

### Fil: `src/hooks/usePushNotifications.ts`

```typescript
// Endre fra:
let registration = await navigator.serviceWorker.getRegistration('/sw-push.js');
if (!registration) {
  registration = await navigator.serviceWorker.register('/sw-push.js', { scope: '/' });
}

// Til:
const registration = await navigator.serviceWorker.ready;
```

## Oppsummering

| Steg | Handling | Prioritet |
|------|----------|-----------|
| 1 | Verifiser VAPID-nøkkel i Supabase | Kritisk |
| 2 | Konsolidere service workers | Høy |
| 3 | Konfigurer Samsung batteriinnstillinger | Medium |
| 4 | Re-abonner på push fra telefonen | Påkrevd |

