
# Plan: Fikse Push-varsler på iOS

## Problemanalyse

Etter grundig undersøkelse har jeg identifisert rotårsaken:

**Hovedproblem**: I `usePushNotifications.ts` (linje 109-118) sjekker koden om det finnes et eksisterende push-abonnement, og hvis det gjør det, bruker den det i stedet for å opprette et nytt. Problemet er at dette eksisterende abonnementet ble opprettet med de gamle VAPID-nøklene.

**Konsekvens**: Selv om du toggler av/på i appen, forblir det gamle abonnementet på enhetsnivå og vil alltid feile med 403 Forbidden.

**Bevis fra loggene**:
```
Push failed for user: 403 pushing message failed: 403 Forbidden
"the VAPID credentials in the authorization header do not correspond to the credentials used to create the subscriptions"
```

## Løsning

### Del 1: Fikse subscribe-funksjonen

Oppdatere `src/hooks/usePushNotifications.ts` til å:
1. **Alltid slette eksisterende abonnement** før du oppretter et nytt
2. Legge til bedre feilhåndtering og logging
3. Legge til iOS PWA-deteksjon med informative meldinger

### Del 2: Forbedre unsubscribe-funksjonen

Sørge for at unsubscribe faktisk sletter abonnementet fra nettleseren, ikke bare fra databasen.

### Del 3: Slette gamle abonnementer fra databasen

Kjøre en SQL-kommando for å slette alle eksisterende push-abonnementer slik at alle starter med blanke ark.

## Tekniske endringer

### Fil: `src/hooks/usePushNotifications.ts`

**Endring i subscribe-funksjonen (linje 108-118)**:

Fra:
```typescript
// Get push subscription
let subscription = await registration.pushManager.getSubscription();

if (!subscription) {
  // Create new subscription
  subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });
}
```

Til:
```typescript
// ALLTID slett eksisterende abonnement først for å sikre nye VAPID-nøkler brukes
let existingSubscription = await registration.pushManager.getSubscription();
if (existingSubscription) {
  console.log('Removing existing push subscription...');
  await existingSubscription.unsubscribe();
}

// Opprett nytt abonnement med gjeldende VAPID-nøkler
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
});
console.log('New push subscription created:', subscription.endpoint);
```

**Legge til iOS PWA-deteksjon øverst i subscribe**:
```typescript
// Sjekk iOS og PWA-status
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isPWA = window.matchMedia('(display-mode: standalone)').matches 
           || (window.navigator as any).standalone === true;

if (isIOS && !isPWA) {
  toast.error('På iOS må appen være lagt til hjemskjermen. Gå til Del-menyen og velg "Legg til på Hjem-skjerm".');
  return false;
}
```

**Forbedre feilhåndtering**:
```typescript
} catch (error) {
  console.error('Error subscribing to push:', error);
  
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      toast.error('Tilgang til push-varsler ble avvist av nettleseren');
    } else if (error.name === 'AbortError') {
      toast.error('Push-registrering ble avbrutt');
    } else {
      toast.error(`Push-feil: ${error.name} - ${error.message}`);
    }
  } else {
    toast.error('Kunne ikke aktivere push-varsler. Sjekk konsollen for detaljer.');
  }
  return false;
}
```

### Database-migrasjon

Slette alle eksisterende push-abonnementer:
```sql
DELETE FROM push_subscriptions;
```

## Flyt etter endringene

```text
+-------------------+     +-------------------+     +-------------------+
|  Bruker aktiverer | --> |  Slett gammelt    | --> |  Opprett nytt     |
|  push-varsler     |     |  abonnement       |     |  med nye nøkler   |
+-------------------+     +-------------------+     +-------------------+
                                                              |
                                                              v
+-------------------+     +-------------------+     +-------------------+
|  Push fungerer!   | <-- |  Edge function    | <-- |  Lagre i database |
|                   |     |  sender varsling  |     |                   |
+-------------------+     +-------------------+     +-------------------+
```

## Oppsummering

| Steg | Handling | Fil |
|------|----------|-----|
| 1 | Alltid slette eksisterende abonnement før nytt opprettes | usePushNotifications.ts |
| 2 | Legge til iOS PWA-deteksjon | usePushNotifications.ts |
| 3 | Forbedre feilmeldinger | usePushNotifications.ts |
| 4 | Slette gamle abonnementer fra database | SQL-migrasjon |
