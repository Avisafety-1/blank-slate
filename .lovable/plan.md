

# Fix: Data forsvinner ved sideoppdatering/navigasjon offline

## Rotarsak

Problemet er at alle data-hentende komponenter bruker et **fetch-forst**-monster: de starter med tom tilstand `[]`, prover a hente fra Supabase (som feiler offline), og forst da laster de fra cache. Dette gir to problemer:

1. **Timing-problem**: Nar siden lastes pa nytt, er `companyId` fra AuthContext null i noen millisekunder. Fetch-funksjonen kjorer med `companyId=null`, feiler, og cachenokkel `offline_xxx_null` matcher ikke den lagrede nokkelens `offline_xxx_abc123`. Resultatet er tom data + feilmelding.

2. **Unodvendig nettverksforsok**: Selv nar enheten vet den er offline (`navigator.onLine === false`), prover den likevel a gjore Supabase-kall som feiler og forarsaker feilmeldinger.

3. **Direkte Supabase auth-kall**: Flere komponenter kaller `supabase.auth.getUser()` direkte (IncidentsSection, CalendarWidget, Kalender), som returnerer null offline og forer til manglende data (f.eks. "mine oppfolginger" forsvinner).

4. **Manglende offline-guard pa auth-redirects**: Sider som Resources, Oppdrag, Hendelser og Documents sjekker `if (!loading && !user) navigate("/auth")` uten offline-unntak.

---

## Losning: Cache-forst-monster

Endre alle fetch-funksjoner fra "fetch-forst, cache-som-fallback" til "cache-forst, fetch-hvis-online":

```text
// NYTT MONSTER:
const fetchData = async () => {
  const cacheKey = companyId ? `offline_xxx_${companyId}` : null;

  // 1. Last fra cache umiddelbart (gir instant visning)
  if (cacheKey) {
    const cached = getCachedData(cacheKey);
    if (cached) setData(cached);
  }

  // 2. Hopp over nettverkskall hvis offline
  if (!navigator.onLine) {
    setLoading(false);
    return;
  }

  // 3. Hent ferske data fra nett
  try {
    const { data, error } = await supabase.from("xxx").select("*");
    if (error) throw error;
    setData(data || []);
    if (cacheKey) setCachedData(cacheKey, data || []);
  } catch (error) {
    console.error("Error:", error);
    // Data er allerede lastet fra cache i steg 1
    toast.error("Kunne ikke oppdatere data");
  } finally {
    setLoading(false);
  }
};
```

---

## Implementeringsplan

### Steg 1: Dashboard-komponenter - cache-forst

Oppdater alle 5 dashboard-komponenter til cache-forst-monsteret:

**DocumentSection.tsx**:
- `fetchDocuments()`: Last cache forst, deretter hopp over nett hvis offline

**MissionsSection.tsx**:
- `fetchMissions()`: Last cache forst, hopp over nett + `auto-complete-missions` edge function-kall

**IncidentsSection.tsx**:
- `fetchIncidents()`: Last cache forst
- `fetchMyFollowUps()`: Erstatt `supabase.auth.getUser()` med `user` fra AuthContext-props; last cache forst
- `fetchCommentCounts()`: Hopp over hvis offline

**CalendarWidget.tsx**:
- `fetchCustomEvents()` og `fetchRealCalendarEvents()`: Last cache forst
- `checkAdminStatus()`: Legg til offline-guard (`if (!navigator.onLine) return;`)

**NewsSection.tsx**:
- `fetchNews()`: Last cache forst (delvis implementert allerede, men mangler "hopp over nett")

### Steg 2: Helsider - cache-forst

**Oppdrag.tsx**:
- `fetchMissions()`: Last cache forst, hopp over nett
- Auth-redirect: Legg til `&& navigator.onLine` i sjekken

**Hendelser.tsx**:
- `fetchIncidents()`: Last cache forst, hopp over nett
- Auth-redirect: Legg til offline-guard
- `fetchCommentsData()`, `fetchMissions()`, `fetchEccairsExports()`: Hopp over hvis offline

**Resources.tsx**:
- Alle 4 fetch-funksjoner: Last cache forst (allerede delvis implementert, men mangler "hopp over nett"-logikk)
- Auth-redirect: Legg til offline-guard

**Kalender.tsx**:
- `fetchCustomEvents()`: Last cache forst, hopp over nett (allerede delvis implementert)
- `checkAdminStatus()`: Legg til offline-guard

**Documents.tsx**:
- Realtime-subscription: Legg til `if (!navigator.onLine) return;` guard
- Auth-redirect: Legg til offline-guard

### Steg 3: IncidentsSection bruk av supabase.auth.getUser()

`fetchMyFollowUps()` kaller `supabase.auth.getUser()` som feiler offline. Erstatt med `user` fra `useAuth()` som allerede er tilgjengelig i komponenten.

### Steg 4: CalendarWidget og Kalender checkAdminStatus()

Begge kaller `supabase.auth.getUser()` direkte. Legg til offline-guard sa de bare kjorer nar nett er tilgjengelig. Admin-status er ikke kritisk offline.

---

## Endrede filer

| Fil | Endring |
|-----|---------|
| `src/components/dashboard/DocumentSection.tsx` | Cache-forst i `fetchDocuments()` |
| `src/components/dashboard/MissionsSection.tsx` | Cache-forst i `fetchMissions()` |
| `src/components/dashboard/IncidentsSection.tsx` | Cache-forst + erstatt `getUser()` med AuthContext |
| `src/components/dashboard/CalendarWidget.tsx` | Cache-forst + offline-guard pa `checkAdminStatus()` |
| `src/components/dashboard/NewsSection.tsx` | Cache-forst med early return |
| `src/pages/Oppdrag.tsx` | Cache-forst + offline auth-guard |
| `src/pages/Hendelser.tsx` | Cache-forst + offline auth-guard + guard sekundaer-fetches |
| `src/pages/Resources.tsx` | Cache-forst early return + offline auth-guard |
| `src/pages/Kalender.tsx` | Cache-forst + offline-guard pa `checkAdminStatus()` |
| `src/pages/Documents.tsx` | Realtime offline-guard + offline auth-guard |

---

## Forventet resultat

1. Bruker er online - all data hentes og caches i localStorage
2. Bruker gar offline - data forblir synlig fra cache
3. Bruker oppdaterer siden offline - cache lastes umiddelbart, ingen feilmeldinger
4. Bruker navigerer mellom sider offline - cache lastes pa nytt for hver side
5. Ingen unodvendige nettverkskall eller toast-feilmeldinger offline
6. Bruker far nett igjen - ferske data hentes automatisk

