

# Offline-modus for AviSafe

## Kartlegging av nettverksstatus

### Hva som allerede finnes
- **PWA med Service Worker**: Appen bruker allerede `vite-plugin-pwa` med `injectManifest`-strategi og precaching av statiske filer (JS, CSS, HTML, bilder)
- **localStorage for flytimer**: `useFlightTimer` lagrer allerede starttid, misjon-ID og publish mode i localStorage som backup
- **Databasen som "source of truth"**: Aktiv flytur lagres i `active_flights`-tabellen med localStorage som fallback

### Alle sider og funksjoner - offline-vurdering

| Side / Funksjon | Avhenger av nett | Kan fungere offline | Synkronisering |
|---|---|---|---|
| **Dashboard (/)** | Ja - henter misjoner, hendelser, nyheter, dokumenter, KPI | Delvis - kan vise cachet data | Les-cache |
| **Oppdrag (/oppdrag)** | Ja - henter/oppretter misjoner | Delvis - lese cachet, opprette lokalt | Koe nye oppdrag |
| **Kart (/kart)** | Ja - kartfliser, luftromsdata, SafeSky | Svart begrenset - kartfliser caches ikke godt | Begrenset |
| **Dokumenter (/dokumenter)** | Ja - henter fra Supabase | Delvis - lese cachet dokumentliste | Les-cache |
| **Kalender (/kalender)** | Ja - henter hendelser | Delvis - lese cachet | Les-cache |
| **Hendelser (/hendelser)** | Ja - henter/oppretter hendelser | Delvis - lese cachet, opprette lokalt | Koe nye hendelser |
| **Status (/status)** | Ja - henter statistikk | Delvis - lese cachet | Les-cache |
| **Ressurser (/ressurser)** | Ja - droner, utstyr, personell | Delvis - lese cachet | Les-cache |
| **Flytidstimer** | Ja - starter i databasen | JA - allerede delvis offline | Sync ved nett |
| **Flylogging (LogFlightTimeDialog)** | Ja - INSERT til database | JA - kan koes lokalt | Sync ved nett |
| **Start flytur (StartFlightDialog)** | Ja - sjekklister, SafeSky | Delvis - kan starte lokalt | Sync ved nett |
| **Profil** | Ja - henter/oppdaterer profil | Begrenset | Les-cache |
| **Admin (/admin)** | Ja - brukeradministrasjon | NEI - krever live data | Ikke aktuelt |
| **AI-sok** | Ja - edge function | NEI - krever nett | Ikke aktuelt |
| **AI Risikovurdering** | Ja - edge function | NEI - krever nett | Ikke aktuelt |

### Funksjoner som KAN fungere offline med synkronisering

**Prioritet 1 - Kritisk (brukes i felt uten nett)**:
1. **Flytidstimer** - Allerede delvis offline (localStorage). Trenger: offline start og stopp uten database
2. **Logge flytur** - Lagre flylogg lokalt, sync senere
3. **Opprette hendelser/avvik** - Lagre lokalt, sync senere

**Prioritet 2 - Viktig (lese cachet data)**:
4. **Lese oppdrag** - Vis sist hentet data fra cache
5. **Lese dokumenter** - Vis dokumentliste fra cache
6. **Lese ressurser** - Vis droner, utstyr, personell fra cache
7. **Lese kalender** - Vis hendelser fra cache

**Prioritet 3 - Ikke mulig offline**:
- Kart (trenger kartfliser fra internett)
- AI-sok og AI-risikovurdering (trenger edge functions)
- Admin-panelet (trenger live data for brukerbehandling)
- SafeSky-integrasjon (trenger API)
- Push-notifikasjoner (trenger nett)

---

## Implementeringsplan

### Steg 1: Nettverksstatus-indikator (Offline-banner)

Opprette en `useNetworkStatus`-hook som bruker `navigator.onLine` og `online`/`offline` events. Vise en synlig statuslinje oeverst i appen (under Header) med teksten "Du er frakoblet - endringer lagres lokalt" med en gul/oransje bakgrunn. Banneret vises kun nar appen er offline, og forsvinner med en "Synkroniserer..."-melding nar nett er tilbake.

**Filer:**
- Ny: `src/hooks/useNetworkStatus.ts`
- Ny: `src/components/OfflineBanner.tsx`
- Endre: `src/App.tsx` - legge til OfflineBanner i AuthenticatedLayout

### Steg 2: Offline-ko-system (Sync Queue)

Opprette et generisk system for a koe opp database-operasjoner som skal utfores nar nett er tilbake:

- `src/lib/offlineQueue.ts` - Haandterer localStorage-basert ko av pending operasjoner
  - Lagrer operasjoner som `{ id, table, operation, data, timestamp }`
  - Ved `online`-event: prosesser koen sekvensielt
  - Vis toast-melding "X endringer synkronisert" nar koen er tomt
  - Haandterer feil (f.eks. konflikter) med retry-logikk

### Steg 3: Offline flytidslogging

Oppdatere `useFlightTimer.ts`:
- `startFlight`: Hvis offline, lagre kun i localStorage (hopp over database INSERT). Koe database-operasjonen.
- `endFlight`: Hvis offline, lagre kun i localStorage. Koe database DELETE.
- Ved online: Sync `active_flights` fra localStorage til database.

Oppdatere `LogFlightTimeDialog.tsx`:
- Hvis offline ved innsending: Lagre flyloggen i offline-koen istedenfor a sende direkte til Supabase
- Vis melding "Flylogg lagret lokalt - synkroniseres nar nett er tilbake"

### Steg 4: Offline hendelsesrapportering

Oppdatere `AddIncidentDialog.tsx`:
- Hvis offline: Lagre hendelsen i offline-koen
- Vis melding "Hendelse lagret lokalt"

### Steg 5: Lese-cache for data (TanStack Query)

TanStack Query har allerede innebygd caching. Konfigurere `staleTime` og `gcTime` (garbage collection time) for a beholde data lengre:

Oppdatere QueryClient i `App.tsx`:
```text
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,    // 5 min for data er "stale"
      gcTime: 24 * 60 * 60 * 1000,  // Behold i 24 timer
      retry: (failureCount, error) => {
        if (!navigator.onLine) return false;
        return failureCount < 3;
      },
    },
  },
});
```

Implementere `persistQueryClient` med localStorage for a overleve app-restart:

- Installere `@tanstack/query-sync-storage-persister` og `@tanstack/react-query-persist-client`
- Wrapp appen med `PersistQueryClientProvider`
- Cachet data lastes fra localStorage ved oppstart og vises umiddelbart

### Steg 6: Synkroniseringslogikk ved online-event

I `useNetworkStatus`-hooken:
- Lytt pa `online`-eventet
- Nar nett er tilbake:
  1. Vis "Synkroniserer..." i banneret
  2. Prosesser offline-koen (INSERT/UPDATE/DELETE operasjoner)
  3. Invalider TanStack Query-cacher for a hente ferske data
  4. Vis "Synkronisering fullfort" toast

---

## Tekniske detaljer

### offlineQueue.ts - Kjernestruktur

```text
interface QueuedOperation {
  id: string;
  table: string;
  operation: 'insert' | 'update' | 'delete';
  data: Record<string, unknown>;
  timestamp: number;
  retries: number;
}

- addToQueue(op): Legger til i localStorage-array
- getQueue(): Henter pending operasjoner
- processQueue(): Kjoerer alle operasjoner mot Supabase
- removeFromQueue(id): Fjerner fullfort operasjon
```

### useNetworkStatus.ts

```text
- Bruker navigator.onLine for initial status
- Lytter pa window 'online' og 'offline' events
- Returnerer { isOnline, isSyncing }
- Ved 'online': trigger processQueue() og invalidateQueries()
```

### OfflineBanner.tsx

```text
- Fast posisjonert under Header (z-index under header)
- Gul bakgrunn med ikon "WifiOff" og tekst
- Animert inn/ut med CSS transition
- Viser "Synkroniserer..." under prosessering
- Viser antall koede operasjoner
```

### Endringer i eksisterende filer

| Fil | Endring |
|-----|---------|
| `src/App.tsx` | Legge til OfflineBanner, oppdatere QueryClient config, legge til PersistQueryClient |
| `src/hooks/useFlightTimer.ts` | Sjekke `navigator.onLine` for startFlight/endFlight, bruke offlineQueue |
| `src/components/LogFlightTimeDialog.tsx` | Sjekke online-status for submit, koe hvis offline |
| `src/components/dashboard/AddIncidentDialog.tsx` | Sjekke online-status for submit, koe hvis offline |
| `package.json` | Legge til `@tanstack/query-sync-storage-persister` og `@tanstack/react-query-persist-client` |

### Nye filer

| Fil | Formaal |
|-----|---------|
| `src/hooks/useNetworkStatus.ts` | Hook for nettverksstatus |
| `src/components/OfflineBanner.tsx` | Visuell offline-indikator |
| `src/lib/offlineQueue.ts` | Ko-system for offline operasjoner |

---

## Begrensninger og forutsetninger

- **Kartfliser**: Leaflet-kartene vil ikke fungere offline uten en dedikert tile-caching-losning (svart komplekst, anbefales ikke i forste omgang)
- **Filvedlegg**: Opplasting av filer/bilder kan ikke koes offline (for store for localStorage)
- **Autentisering**: Brukerens Supabase-sesjon ma vaere gyldig. Hvis sesjonen utloper mens brukeren er offline, ma de logge inn pa nytt
- **Konflikter**: Hvis samme data endres pa to enheter mens begge er offline, brukes "siste skriver vinner"-strategi
- **localStorage-grense**: Ca 5-10 MB. Tilstrekkelig for metadata og koeoperasjoner, men ikke for store filer

