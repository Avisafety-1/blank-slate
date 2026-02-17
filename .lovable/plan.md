
## Hvorfor du kastes ut ved første innlogging

Det er to samvirkende feil som forårsaker dette:

---

### Årsak 1: Race condition i AuthContext (primærfeil)

Når du logger inn, skjer dette i feil rekkefølge:

```text
1. onAuthStateChange: SIGNED_IN → setLoading(false) ✓, setTimeout(fetchUserInfo) ✓
2. getSession() → setLoading(false) ✓, fetchUserInfo() direkte kall ✓
3. [Kort tid etterpå] — useIdleTimeout starter opp...
4. useIdleTimeout leser avisafe_last_activity fra localStorage
5. Hvis verdien er gammel (> 60 min) → handleLogout() kalles umiddelbart
6. Du kastes ut før du er ferdig med å laste inn!
```

`useIdleTimeout` sin startup-sjekk (linje 76–91) kjøres når `user` først blir satt. Hvis `avisafe_last_activity` i localStorage er gammel nok (over 60 min siden forrige besøk) logger den deg ut med en gang — selv om du nettopp logget inn.

**Andre forsøk fungerer** fordi `avisafe_last_activity` nå er fersk (oppdatert av `resetTimers()` på forrige forsøk), så startup-sjekken passerer.

---

### Årsak 2: «Invalid Refresh Token» ved domeneskiftet

Auth-loggene viser:
```
19:07:16 → 400: Invalid Refresh Token: Refresh Token Not Found
19:10:03 → Token refreshed successfully
```

Siden appen bruker to domener (`login.avisafe.no` og `app.avisafe.no`), og localStorage er per-domene, kan det oppstå at refresh-token fra `login.avisafe.no` ikke er tilgjengelig på `app.avisafe.no`. Supabase prøver å refreshe og feiler → SIGNED_OUT → kastes ut. Andre forsøk fungerer fordi redirect-URL-en nå peker riktig.

---

### Løsning

**Fil: `src/hooks/useIdleTimeout.ts`**

Startup-sjekken som logger ut ved gammel `avisafe_last_activity` må **nullstille tidsstempelet heller enn å logge ut** dersom brukeren nettopp logget inn (d.v.s. det ikke finnes en session fra før):

Slik er det nå:
```typescript
// Logging out if elapsed > LOGOUT_TIME_MS
if (elapsed > LOGOUT_TIME_MS) {
  handleLogout();  // ← Kaster ut selv om du nettopp logget inn!
}
```

Slik bør det være:
```typescript
// Bare logg ut hvis vi ikke nettopp fikk en ny sesjon
// En ny innlogging betyr at activity-timestampet bør resettes, ikke brukes til å kaste ut
if (elapsed > LOGOUT_TIME_MS) {
  // Sjekk om session-tokenet i Supabase er nytt (under 2 min gammel)
  // Hvis sesjon er ny → bare oppdater timestamp, ikke logg ut
  const sessionAge = session ? Date.now() - new Date(session.expires_at! * 1000 - 3600000).getTime() : Infinity;
  if (sessionAge < 2 * 60 * 1000) {
    // Ny innlogging — reset timestamp i stedet for å logge ut
    saveLastActivity();
  } else {
    handleLogout();
  }
}
```

Men en enklere og sikrere tilnærming er å **alltid resette `avisafe_last_activity` når brukeren logger inn**, direkte i `AuthContext` når `SIGNED_IN`-eventet mottas — før `useIdleTimeout` rekker å lese den gamle verdien.

---

### Tekniske endringer

**Fil 1: `src/contexts/AuthContext.tsx`**

I `onAuthStateChange`-handleren, under `SIGNED_IN`-blokken (linje 149–162), legg til:
```typescript
// Reset idle timestamp on fresh login so useIdleTimeout
// doesn't immediately log the user out due to a stale timestamp
try {
  localStorage.setItem('avisafe_last_activity', Date.now().toString());
} catch {}
```

Dette sikrer at `avisafe_last_activity` alltid er fersk ved en ny innlogging, og startup-sjekken i `useIdleTimeout` vil ikke feile.

**Fil 2: `src/hooks/useIdleTimeout.ts`**

Startup-sjekken (linje 77–91) bør også legges til et ekstra sikkerhetslag: Dersom tidsstempling mangler (første gang) **eller** er gammel, skriv ny aktivitet og ikke kast ut:

```typescript
useEffect(() => {
  if (!user) return;
  
  // Skip the startup check in iframe/preview environments
  const isIframe = window.self !== window.top;
  if (isIframe) {
    saveLastActivity();
    return;
  }
  
  try {
    const last = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (last) {
      const elapsed = Date.now() - parseInt(last, 10);
      if (elapsed > LOGOUT_TIME_MS) {
        console.log('IdleTimeout: Logging out — inactive for', Math.round(elapsed / 60000), 'min');
        handleLogout();
      }
    } else {
      saveLastActivity();
    }
  } catch {}
}, [user, handleLogout]);
```

Nøkkelendringen er at `AuthContext` setter `avisafe_last_activity` umiddelbart ved `SIGNED_IN` — dette er den primære fiksen. Resultatet er at ved neste runde med `useIdleTimeout`-startup vil `elapsed` alltid være noen sekunder, aldri over 60 minutter.

---

### Oppsummert

- **Primær fiks**: Sett `avisafe_last_activity = now()` i `AuthContext` under `SIGNED_IN`-event
- **Sekundær fiks**: Legg til iframe-guard i `useIdleTimeout` startup-sjekken (som allerede er nevnt i arkitektur-minne)
- **Berørte filer**: `src/contexts/AuthContext.tsx` og `src/hooks/useIdleTimeout.ts`
