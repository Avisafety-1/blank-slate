

## Plan: Raskere lasting av kartlag, admin/profil/dokumenter, og cached luftromssjekk

### Problem 1: Lazy-loading forsinkelse
Admin, Documents, Profil etc. bruker `React.lazy()` som betyr at JS-bundlen lastes ned først når brukeren navigerer dit. Dette gir en LoadingSpinner-forsinkelse.

**Løsning:** Legg til `prefetch`/preload av de viktigste sidene (Admin, Documents, Resources, Oppdrag, Kart) etter initial render via `requestIdleCallback` eller en kort `setTimeout`. Slik er bundlene allerede lastet når brukeren klikker.

### Problem 2: Kartlag trenger ikke rolle-sjekk
Bekreftet: `mapDataFetchers.ts` og `OpenAIPMap.tsx` bruker IKKE `useAuth`, `companyId`, `userRole` eller `isAdmin`. Kartlagene lastes uavhengig av auth-state. Forsinkelsen brukeren ser er kun lazy-loading av `Kart.tsx`-bundlen og database statement timeouts (57014-feil som ses i nettverksloggene).

### Problem 3: AirspaceWarnings re-kjører RPC ved hvert klikk på kartpinne
Når brukeren åpner `MissionDetailDialog` fra kartet, kaller `AirspaceWarnings`-komponenten `check_mission_airspace` RPC-funksjonen på nytt — selv om luftromsdataene allerede finnes i oppdraget (fra `/oppdrag`-siden). Denne RPC-en er treg.

**Løsning:** 
1. Lagre luftromsresultatet på oppdraget (cache i mission-objektet) etter første sjekk
2. I `AirspaceWarnings`: hvis `cachedWarnings` prop er gitt, bruk den direkte uten RPC-kall
3. I `MissionDetailDialog`: pass cached warnings fra mission-objektet hvis tilgjengelig

### Endringer

#### 1. `src/App.tsx` — Prefetch lazy-loaded sider

Legg til en `useEffect` i `AuthenticatedLayout` som preloader de vanligste sidene etter mount:

```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    // Prefetch common pages so they're ready when user navigates
    import("./pages/Admin");
    import("./pages/Resources");
    import("./pages/Documents");
    import("./pages/Kart");
    import("./pages/Oppdrag");
  }, 2000);
  return () => clearTimeout(timer);
}, []);
```

#### 2. `src/components/dashboard/AirspaceWarnings.tsx` — Støtt cached warnings

- Legg til `cachedWarnings?: AirspaceWarning[]` prop
- Hvis `cachedWarnings` er gitt, bruk det direkte og skip RPC-kallet
- Behold eksisterende logikk som fallback

#### 3. `src/components/dashboard/MissionDetailDialog.tsx` — Pass cached warnings

- Sjekk om mission-objektet allerede har `airspaceWarnings` (fra oppdrag-listen)
- Pass til `AirspaceWarnings` som `cachedWarnings` prop

#### 4. `src/hooks/useOppdragData.ts` — Lagre airspace-resultat på mission

- Etter at `AirspaceWarnings` returnerer resultat første gang, cache det på mission-objektet
- Alternativt: kjør `check_mission_airspace` batch for alle oppdrag ved lasting (for dyrt)
- **Enklere tilnærming:** La `MissionDetailDialog` lagre resultatet tilbake til mission-objektet via en callback, slik at neste åpning bruker cache

### Filer som endres

| Fil | Endring |
|-----|---------|
| `src/App.tsx` | Prefetch lazy-loaded sider etter mount |
| `src/components/dashboard/AirspaceWarnings.tsx` | `cachedWarnings` prop, skip RPC hvis cached |
| `src/components/dashboard/MissionDetailDialog.tsx` | Pass cached warnings fra mission, cache resultat |

