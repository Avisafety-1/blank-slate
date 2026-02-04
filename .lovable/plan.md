

# Plan: Smart Backend-cachet SafeSky Beacons med Bruker-aktivert API

## Oversikt
Erstatte Airplanes.live med SafeSky `/v1/beacons` for hele Norge. API-kall gjøres kun fra backend og **kun når minst én bruker er på kartvisningen**. Dette sparer API-kvote når ingen ser på kartet.

## Arkitektur

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Bruker-aktivert Backend Cache                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    heartbeat      ┌───────────────────────┐               │
│  │  OpenAIPMap  │  ──────────────►  │ map_viewer_heartbeats │               │
│  │  (frontend)  │    hvert 5s       │ (database tabell)     │               │
│  └──────┬───────┘                   └───────────┬───────────┘               │
│         │                                       │                           │
│         │ real-time                             │ sjekkes av                │
│         │ subscription                          ▼                           │
│         │                           ┌───────────────────────┐               │
│         │                           │ safesky-beacons-fetch │               │
│         │                           │ (edge function)       │               │
│         │                           │ - kjører hvert 1s     │               │
│         │                           │ - sjekker om brukere  │               │
│         │                           │   er aktive (< 10s)   │               │
│         │                           │ - henter fra SafeSky  │               │
│         │                           │   kun ved aktive      │               │
│  ┌──────▼───────┐                   └───────────┬───────────┘               │
│  │safesky_beacons│ ◄────────────────────────────┘                           │
│  │(database)     │            upsert beacons                                │
│  └───────────────┘                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Tekniske komponenter

### 1. Ny databasetabell: `map_viewer_heartbeats`
Holder styr på hvem som aktivt ser på kartet.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | uuid | Unik bruker/session ID |
| user_id | uuid | Bruker-ID (nullable for anonyme) |
| last_seen | timestamptz | Sist oppdatert tidsstempel |

### 2. Ny Edge Function: `safesky-beacons-fetch`
Dedikert funksjon for å hente beacons for hele Norge.

- Bruker `SAFESKY_BEACONS_API_KEY` (ny produksjonsnøkkel)
- Produksjons-URL: `https://public-api.safesky.app/v1/beacons?viewport=57.5,4.0,71.5,31.5`
- **Sjekker først** om det finnes aktive viewers (heartbeat < 10 sekunder)
- Hvis ingen aktive: returner tidlig uten API-kall
- Hvis aktive: hent beacons og upsert til `safesky_beacons`
- Slett gamle beacons (> 30 sekunder)

### 3. Cron-jobb (pg_cron)
Kaller `safesky-beacons-fetch` hvert sekund.

```sql
select cron.schedule(
  'safesky-beacons-norway',
  '* * * * *', -- hvert minutt med 1-sekunds loop inne i funksjonen
  $$ ... $$
);
```

**Alternativ for 1-sekunds granularitet:**
Edge function kjører en loop i 55 sekunder, med 1 sekunds pause mellom hvert kall. Cron starter den hvert minutt.

### 4. Frontend-endringer (`OpenAIPMap.tsx`)

**Legge til:**
- `sendHeartbeat()` funksjon som kaller Supabase for å oppdatere `map_viewer_heartbeats`
- Heartbeat sendes hvert 5. sekund mens bruker er på kartsiden
- Ved unmount: slett heartbeat-rad

**Fjerne:**
- `fetchAircraft()` funksjon (linje 1079-1132)
- `aircraftLayer` og "Flytrafikk (live)" kartlag
- Import av `airplanesLiveConfig`
- `setInterval(fetchAircraft, 10000)` (linje 1499)
- `map.on("moveend")` for fetchAircraft (linje 1569-1572)

**Endre:**
- Rename "SafeSky (live)" til "Lufttrafikk (live)" for bedre UX

### 5. Slett ubrukt fil
`src/lib/airplaneslive.ts` - ikke lenger i bruk

## API-nøkler

| Nøkkel | Brukes til | Miljø |
|--------|------------|-------|
| `SAFESKY_API_KEY` | advisory, uav | Sandbox (uendret) |
| `SAFESKY_BEACONS_API_KEY` | beacons for kart | Produksjon (ny) |

## Dataflyt: Smart Aktivering

1. **Bruker åpner /kart** → Frontend sender heartbeat til `map_viewer_heartbeats`
2. **Hvert 5. sekund** → Frontend sender nytt heartbeat
3. **Cron-job (hvert 1s)** → Edge function sjekker for aktive viewers
4. **Aktive viewers funnet** → Hent beacons fra SafeSky, upsert til database
5. **Ingen aktive viewers** → Ingen API-kall, spar kvote
6. **Bruker forlater /kart** → Heartbeat slettes, API stopper automatisk

## Filendringer

| Fil | Endring |
|-----|---------|
| `supabase/functions/safesky-beacons-fetch/index.ts` | Ny - henter beacons fra produksjons-API |
| `supabase/config.toml` | Legg til ny funksjon |
| `src/components/OpenAIPMap.tsx` | Fjern Airplanes.live, legg til heartbeat |
| `src/lib/airplaneslive.ts` | Slett |
| **Database-migrasjon** | Opprett `map_viewer_heartbeats` tabell |
| **pg_cron** | Opprett cron-jobb for 1-sekunds kall |

## Estimert API-bruk

| Scenario | Kall/minutt | Kall/time |
|----------|-------------|-----------|
| Ingen aktive brukere | 0 | 0 |
| 1+ aktive brukere | 60 | 3600 |
| Tidligere (per bruker) | 6 x N brukere | 360 x N |

**Fordel:** API-bruk er konstant uavhengig av antall samtidige brukere.

## Sikkerhet

- Heartbeat-tabellen har RLS policy som tillater alle å oppdatere sin egen rad
- Edge function bruker service role for å lese heartbeats og skrive beacons
- Ingen sensitiv data eksponeres

## Status: IMPLEMENTERT ✅

Alle komponenter er implementert:
- ✅ Database-tabell `map_viewer_heartbeats` opprettet
- ✅ Edge function `safesky-beacons-fetch` opprettet  
- ✅ OpenAIPMap.tsx oppdatert med heartbeat-system
- ✅ Airplanes.live fjernet, SafeSky renamed til "Lufttrafikk (live)"
- ✅ `src/lib/airplaneslive.ts` slettet
- ✅ `supabase/config.toml` oppdatert

## Neste steg for å fullføre
1. Sett opp en cron-jobb som kaller `safesky-beacons-fetch` hvert sekund (via pg_cron eller ekstern scheduler)

