

# Fix: Offline-modus tomme sider, feilmeldinger og data som forsvinner

## Sammendrag av problemer

Etter grundig gjennomgang av kodebasen er det identifisert **4 hovedproblemer** som til sammen gjor offline-opplevelsen darlig:

---

## Problem 1: Dashboard-seksjoner mangler offline-cache

Folgende komponenter henter data fra Supabase men har INGEN offline-cache:

| Komponent | Konsekvens offline |
|-----------|-------------------|
| `DocumentSection.tsx` | Viser `toast.error("Kunne ikke laste dokumenter")`, tom liste |
| `MissionsSection.tsx` | Mister alle oppdrag, tom liste |
| `IncidentsSection.tsx` | Viser `toast.error("Kunne ikke laste hendelser")` + `toast.error("Kunne ikke laste oppfolginger")`, tom liste |
| `NewsSection.tsx` | Mister alle nyheter, tom liste |
| `CalendarWidget.tsx` | Mister alle kalenderhendelser |

Disse komponentene brukes pa dashboard-siden (Index.tsx), som er hovedsiden brukeren ser.

---

## Problem 2: Sanntidsabonnementer trigger re-fetch som feiler offline

Alle sider har Supabase Realtime-kanaler som lytter pa database-endringer. Nar kanalen kobler fra/til (som skjer nar nett forsvinner), kan callbacken trigge `fetchData()`. Denne feiler offline og viser feilmeldinger. Eksempel fra `MissionsSection.tsx`:

```text
.on('postgres_changes', ..., () => {
  fetchMissions(); // Feiler offline, gir feil
})
```

**Losning**: Sjekk `navigator.onLine` i callbacken -- hopp over fetch hvis offline.

---

## Problem 3: Kalender-siden sjekker auth direkte og omdirigerer

`Kalender.tsx` linje 118-125 bruker `supabase.auth.getSession()` direkte for a sjekke innlogging. Denne returnerer `null` offline og omdirigerer til `/auth`:

```text
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  navigate("/auth"); // Feil: Bruker er innlogget men session er null offline
}
```

---

## Problem 4: Feilmeldinger vises ikke kontekstuelt

Nar appen gar offline, feiler 5+ fetch-kall samtidig, noe som gir en "strom" av toast-meldinger som overvelder brukeren. Meldinger som "Kunne ikke laste dokumenter", "Kunne ikke laste hendelser" osv. er ikke nyttige nar brukeren allerede ser offline-banneret.

---

## Implementeringsplan

### Steg 1: Legg til offline-cache i DocumentSection.tsx

Importer `getCachedData` og `setCachedData`. Oppdater `fetchDocuments()` til a:
1. Cache data etter vellykket henting
2. Laste fra cache hvis feil skjer og enheten er offline
3. Kun vise toast-feil nar enheten er ONLINE

### Steg 2: Legg til offline-cache i MissionsSection.tsx

Oppdater `fetchMissions()` med samme monster. Cache misjoner med nokkel `offline_dashboard_missions_{companyId}`.

### Steg 3: Legg til offline-cache i IncidentsSection.tsx

Oppdater `fetchIncidents()` og `fetchMyFollowUps()`. Undertrykk toast-feil offline.

### Steg 4: Legg til offline-cache i NewsSection.tsx

Oppdater `fetchNews()` med cache-monster.

### Steg 5: Legg til offline-cache i CalendarWidget.tsx

Oppdater fetch-logikken med cache-monster.

### Steg 6: Guard alle Realtime-callbacks mot offline

I alle komponenter som har `.on('postgres_changes', ...)`, legg til sjekk:

```text
.on('postgres_changes', ..., () => {
  if (!navigator.onLine) return;  // Hopp over re-fetch offline
  fetchData();
})
```

Denne endringen gjelder:
- `DocumentSection.tsx`
- `MissionsSection.tsx`  
- `IncidentsSection.tsx`
- `NewsSection.tsx`
- `CalendarWidget.tsx`
- `Resources.tsx`
- `Oppdrag.tsx`
- `Hendelser.tsx`
- `Kalender.tsx`
- `useStatusData.ts`

### Steg 7: Fiks Kalender.tsx auth-sjekk

Erstatt den direkte `supabase.auth.getSession()`-sjekken med AuthContext sin `user`:

```text
// FØR (feiler offline):
const { data: { session } } = await supabase.auth.getSession();
if (!session) navigate("/auth");

// ETTER (bruker AuthContext):
// Flyttes til useEffect som avhenger av user fra AuthContext
if (!loading && !user) navigate("/auth");
```

### Steg 8: Undertrykk feil-toasts nar offline

I alle fetch-funksjoner der `toast.error()` kalles, legg til `navigator.onLine`-sjekk:

```text
} catch (error) {
  if (!navigator.onLine) {
    // Laster fra cache stille - brukeren ser allerede offline-banneret
    const cached = getCachedData(cacheKey);
    if (cached) setData(cached);
  } else {
    toast.error("Kunne ikke laste data");
  }
}
```

---

## Endrede filer

| Fil | Endring |
|-----|---------|
| `src/components/dashboard/DocumentSection.tsx` | Offline-cache + undertrykk toast + guard callback |
| `src/components/dashboard/MissionsSection.tsx` | Offline-cache + guard callback |
| `src/components/dashboard/IncidentsSection.tsx` | Offline-cache + undertrykk toast + guard callback |
| `src/components/dashboard/NewsSection.tsx` | Offline-cache + guard callback |
| `src/components/dashboard/CalendarWidget.tsx` | Offline-cache + guard callback |
| `src/pages/Kalender.tsx` | Fiks auth-sjekk + guard callbacks |
| `src/pages/Resources.tsx` | Guard realtime-callbacks mot offline |
| `src/pages/Oppdrag.tsx` | Guard realtime-callbacks mot offline |
| `src/pages/Hendelser.tsx` | Guard realtime-callbacks + undertrykk toast |
| `src/hooks/useStatusData.ts` | Guard realtime-callbacks mot offline |

---

## Flyten etter fix

1. Bruker er online -- all data hentes og caches i localStorage
2. Bruker gar offline -- OfflineBanner viser "Du er frakoblet"
3. Realtime-callbacks hoppet over -- ingen unodvendige re-fetches
4. Dashboard viser cachet data fra siste online-sesjon
5. Ingen feilmeldinger (toast) vises til brukeren
6. Bruker oppdaterer appen offline -- AuthContext gjenoppretter fra cache, sider laster cachet data
7. Bruker far nett igjen -- data re-fetches, oppdateres, synkroniseres

