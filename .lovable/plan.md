

## Kartlag-prioritet og flaskehalser

### Nåværende lasterekkefølge (linje 524-540 i OpenAIPMap.tsx)

```text
1. safeSkyManager.start()         ← BLOKKERER (await warmUpCache + await fetchBeacons)
   └── await warmUpCache()        ← Edge function invoke, kan ta 2-5s
   └── await fetchSafeSkyBeacons()← DB-spørring + auth-guard (getUser)
   └── startupRetryBurst()        ← Ekstra 2+4+6s retries hvis tom
   
2. supabase.auth.getUser().then(… ← Venter på #1 implisitt via event loop
   ├── fetchNsmData()             ← Ekstern ArcGIS-tjeneste (rask, alltid der)
   ├── fetchRpasData()            ← Ekstern ArcGIS-tjeneste (rask)
   ├── fetchAllAipZones()         ← Supabase DB (aip_restriction_zones)
   ├── fetchObstacles()           ← Supabase DB
   ├── fetchAirportsData()        ← Supabase DB
   ├── fetchDroneTelemetry()      ← Supabase DB
   ├── fetchAndDisplayMissions()  ← Supabase DB
   ├── fetchActiveAdvisories()    ← Supabase DB
   └── fetchPilotPositions()      ← Supabase DB
```

### Problemet

**SafeSky blokkerer alt annet.** `safeSkyManager.start()` kalles på linje 527 og er `async` — den `await`-er `warmUpCache()` (edge function-kall) og deretter `fetchSafeSkyBeacons()`. Selv om `start()` ikke formelt `await`-es i useEffect, er den synkron nok til å starte før `.then()`-kjeden.

Men det virkelige problemet er at **begge veiene kjører `supabase.auth.getUser()`**:
- SafeSky sin `fetchSafeSkyBeacons()` kaller `getUser()` som auth-guard (linje 166)
- Hovedflyten kaller `getUser()` på linje 530

Det betyr to parallelle `getUser()`-kall som begge kan trigge token-refresh. Etter lang inaktivitet tar dette ekstra tid.

NSM laster fort fordi den henter fra ArcGIS (ekstern URL) uten auth — ingen Supabase-avhengighet.

### Løsning

**Felles auth-sjekk først, deretter parallell lasting av alt:**

1. **Én `getUser()`-kall** på toppen som sikrer gyldig token
2. **Deretter `Promise.all`** med SafeSky warm-up + alle data-fetchere i parallell
3. SafeSky warm-up og første fetch kjøres som én av mange parallelle oppgaver, ikke som blokkerende forløper

### Endringer

**`src/components/OpenAIPMap.tsx`** (linje 524-540):
```typescript
// 1. Single auth check
const { error: authErr } = await supabase.auth.getUser();
if (authErr) console.warn('Map: auth check failed', authErr);

// 2. Start everything in parallel
safeSkyManager.start();  // no longer blocking
fetchNsmData(…);
fetchRpasData(…);
fetchAllAipZones(…);
fetchObstacles(…);
fetchAirportsData(…);
fetchDroneTelemetry(…);
fetchAndDisplayMissions(…);
fetchActiveAdvisories(…);
fetchPilotPositions(…);
```

**`src/lib/mapSafeSky.ts`** — `start()` og `fetchSafeSkyBeacons()`:
- Fjern den redundante `supabase.auth.getUser()` auth-guarden fra `fetchSafeSkyBeacons()` (auth er allerede sikret av kallet i OpenAIPMap)
- Gjør `warmUpCache()` ikke-blokkerende: kall den uten `await` slik at første DB-fetch kan starte umiddelbart. Warm-up fyller cachen i bakgrunnen, og realtime-subscription plukker opp endringene

```typescript
async function start() {
  if (destroyed || safeskyChannel) return;
  
  // Fire-and-forget warm-up (fills cache in background)
  warmUpCache();
  
  // Immediate DB fetch (may be empty first time, retry burst handles it)
  await fetchSafeSkyBeacons();
  
  if (safeskyMarkersCache.size === 0 && !destroyed) {
    startupRetryBurst();
  }
  
  safeskyChannel = supabase.channel(…).on(…).subscribe();
}
```

### Forventet effekt
- Luftrom (AIP-soner) og SafeSky laster **samtidig** i stedet for sekvensielt
- Fjerner ~2-5 sekunders forsinkelse fra warm-up-blokkering
- NSM forblir like rask som nå (uavhengig av Supabase-auth)
- Kun ett `getUser()`-kall i stedet for to/tre parallelle

### Risiko
Lav. Ingen nye features, bare omstrukturering av rekkefølge og fjerning av redundant auth-sjekk.

