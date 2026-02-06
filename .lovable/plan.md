

# Fix: "Avventer godkjenning" ved offline-modus

## Rotarsak

Det er to problemer som sammen forarsaker at brukeren kastes ut med meldingen "Avventer godkjenning" nar de gar offline:

### Problem 1: Race condition i onAuthStateChange

I `AuthContext.tsx` har vi lagt til en offline-guard for `SIGNED_OUT`-hendelser, men det finnes en `else`-gren (linje 170-174) som fanger ALLE andre hendelser, inkludert `INITIAL_SESSION`:

```text
} else {
  setSession(session);
  setUser(session?.user ?? null);  // <-- Setter user til null offline!
  setLoading(false);
}
```

Nar Supabase fyrer `INITIAL_SESSION` med `session=null` (fordi token-fornyelsen feilet offline), setter denne grenen `user` til `null` -- for `getSession()`-fallbacken rekker a gjenopprette fra cache.

### Problem 2: Manglende offline-sjekk i Index.tsx

I `Index.tsx` linje 271 sjekkes det:

```text
if (!user || !isApproved) {
  // Viser "Avventer godkjenning"-skjermen
}
```

Denne sjekken har ingen offline-unntak. Selv om `AuthenticatedLayout` i `App.tsx` allerede har en `isOfflineWithSession`-sjekk, sa er det `Index.tsx` sin egen sjekk som viser "Avventer godkjenning" til brukeren.

---

## Losning

### Steg 1: Fiks else-grenen i onAuthStateChange (AuthContext.tsx)

Legg til en offline-guard i `else`-grenen slik at vi ikke overskriver brukerdata nar enheten er offline og Supabase returnerer null session:

```text
} else {
  // Offline guard for INITIAL_SESSION with null session
  if (!session && !navigator.onLine) {
    console.log('AuthContext: Ignoring null session event while offline');
    // Try to restore from cache if we don't have a user yet
    if (!user) {
      restoreFromCache();
    }
    setLoading(false);
    return;
  }
  setSession(session);
  setUser(session?.user ?? null);
  setLoading(false);
}
```

### Steg 2: Legg til offline-unntak i Index.tsx

Oppdater sjekken pa linje 271 til a tillate brukere som er offline med cachet sesjon:

```text
const isOfflineWithCachedSession = !navigator.onLine && user;

if (!user || (!isApproved && !isOfflineWithCachedSession)) {
  // Vis "Avventer godkjenning" bare nar brukeren faktisk ikke er godkjent OG er online
  return ( ... );
}
```

---

## Endrede filer

| Fil | Endring |
|-----|---------|
| `src/contexts/AuthContext.tsx` | Legg til offline-guard i `else`-grenen av `onAuthStateChange` for a hindre at brukerdata nullstilles ved `INITIAL_SESSION` |
| `src/pages/Index.tsx` | Legg til offline-unntak i `!isApproved`-sjekken sa brukere ikke ser "Avventer godkjenning" offline |

## Flyten etter fix

1. Bruker er online og innlogget -- alt fungerer normalt, sesjon og profil caches
2. Bruker gar offline -- Supabase fyrer hendelser med null session
3. `onAuthStateChange` fanger null-session offline -- gjenoppretter fra cache i stedet for a nullstille
4. `getSession()` returnerer null offline -- gjenoppretter fra cache (eksisterende logikk)
5. `Index.tsx` ser at bruker er offline med cachet sesjon -- viser dashboardet
6. Bruker far nett igjen -- Supabase forner token, normal drift gjenopptas

