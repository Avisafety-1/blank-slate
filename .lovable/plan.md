
# Konsolidering av Realtime-kanaler

## Hva er problemet?

Hver Supabase Realtime-kanal krever en egen WebSocket-tilkobling. Med 1000 brukere og 12-15 kanaler per bruker betyr det 12.000-15.000 samtidige tilkoblinger mot Supabase. Det er langt over hva de fleste Supabase-planer taler.

## Hva endres?

Den gode nyheten: Supabase tillater at en enkelt kanal lytter pa flere tabeller med flere `.on()`-oppkall. Det betyr at vi kan sla sammen kanaler uten a endre noen logikk for hva som skjer nar data oppdateres.

**Hver komponent beholder sin eksakte callback-logikk** — vi flytter bare lyttere inn pa delte kanaler i stedet for individuelle.

## Kanaloversikt for og etter

### Dashboard (Index-siden)
| For (12 kanaler) | Etter (3 kanaler) |
|---|---|
| status-data-changes (6 tabeller) | **dashboard-main** (samler alt unntatt kommentarer og flyturer) |
| incidents-changes | dashboard-main |
| my-followup-incidents | dashboard-main |
| missions-changes | dashboard-main |
| documents-changes | dashboard-main |
| calendar-events-changes | dashboard-main |
| news-changes | dashboard-main |
| active-flights-dashboard | **dashboard-flights** (aktive flyturer + dronetag) |
| dronetag-tracking-{id} | dashboard-flights |
| pending-approvals (Header) | **header-channel** (beholdes separat, alltid aktiv) |
| incident-comments-changes | dashboard-main |
| presence-room | Beholdes (presence er en annen kanaltype) |

**Resultat:** 12 kanaler redusert til 3 + presence

### Kalender-siden
| For (7 kanaler) | Etter (1 kanal) |
|---|---|
| calendar-events-changes | **kalender-main** |
| missions-changes | kalender-main |
| incidents-changes | kalender-main |
| documents-changes | kalender-main |
| drones-calendar-changes | kalender-main |
| equipment-calendar-changes | kalender-main |
| accessories-calendar-changes | kalender-main |

**Resultat:** 7 kanaler redusert til 1

### Hendelser-siden
| For (3 kanaler) | Etter (1 kanal) |
|---|---|
| incidents_changes | **hendelser-main** |
| eccairs-exports-{env} | hendelser-main |
| hendelser-comments-changes | hendelser-main |

**Resultat:** 3 kanaler redusert til 1

### Ressurser-siden
| For (5 kanaler) | Etter (1 kanal) |
|---|---|
| drones-changes | **ressurser-main** |
| equipment-changes | ressurser-main |
| dronetag-changes | ressurser-main |
| profiles-changes | ressurser-main |
| competencies-changes | ressurser-main |

**Resultat:** 5 kanaler redusert til 1

### Kart-siden
| For (4 kanaler) | Etter (1 kanal) |
|---|---|
| safesky-beacons-changes | **kart-main** |
| missions-changes | kart-main |
| telemetry-changes | kart-main |
| active-flights-advisories | kart-main |

**Resultat:** 4 kanaler redusert til 1

### Admin-siden, Oppdrag-siden, Dokumenter-siden
Disse har allerede 1-2 kanaler hver og endres minimalt.

## Total effekt

| | For | Etter |
|---|---|---|
| Dashboard | ~12 | 3 |
| Kalender | 7 | 1 |
| Hendelser | 3 | 1 |
| Ressurser | 5 | 1 |
| Kart | 4 | 1 |
| **Maks per bruker** | **~12-15** | **~3-4** |
| **1000 brukere** | **12.000-15.000** | **3.000-4.000** |

## Hva pavirkes IKKE

- Ingen endring i hva brukeren ser eller opplever
- Alle callbacks (refetch, inline state-oppdateringer) forblir identiske
- Offline-guard (`navigator.onLine`) beholdes
- Presence-kanalen (brukersynlighet) endres ikke (den bruker en annen protokoll)
- Detail-dialoger (DroneDetailDialog, EquipmentDetailDialog, etc.) som abonnerer med filter pa spesifikk ID beholdes som de er — de er kortvarige og apnes kun en om gangen

## Teknisk tilnarming

For hver side/komponentgruppe:

1. Opprette en enkelt kanal med flere `.on()`-kall, f.eks.:
```text
supabase.channel('kalender-main')
  .on('postgres_changes', { table: 'calendar_events' }, refetch)
  .on('postgres_changes', { table: 'missions' }, refetch)
  .on('postgres_changes', { table: 'documents' }, refetch)
  ...
  .subscribe()
```

2. For dashboard-komponenter som ligger i separate filer, lage en **hook** (`useDashboardChannel`) som oppretter kanalen en gang og lar komponentene registrere sine callbacks

3. Rydde opp cleanup-funksjoner (alle `removeChannel`-kall samles til ett per side)

## Filer som endres

| Fil | Endring |
|---|---|
| `src/hooks/useDashboardRealtime.ts` | **Ny fil** — delt dashboard-kanal med callback-registrering |
| `src/pages/Index.tsx` | Bruk ny hook, fjern individuelle kanaler |
| `src/components/dashboard/IncidentsSection.tsx` | Flytt callbacks til delt hook |
| `src/components/dashboard/MissionsSection.tsx` | Flytt callbacks til delt hook |
| `src/components/dashboard/DocumentSection.tsx` | Flytt callbacks til delt hook |
| `src/components/dashboard/CalendarWidget.tsx` | Flytt callbacks til delt hook |
| `src/components/dashboard/NewsSection.tsx` | Flytt callbacks til delt hook |
| `src/components/dashboard/ActiveFlightsSection.tsx` | Flytt callbacks til delt hook |
| `src/hooks/useStatusData.ts` | Flytt callbacks til delt hook |
| `src/pages/Kalender.tsx` | Konsolider 7 kanaler til 1 |
| `src/pages/Hendelser.tsx` | Konsolider 3 kanaler til 1 |
| `src/pages/Resources.tsx` | Konsolider 5 kanaler til 1 |
| `src/components/OpenAIPMap.tsx` | Konsolider 4 kanaler til 1 |

## Risiko og avbotende tiltak

- **Lav risiko**: Supabase stotter flere `.on()` pa en kanal — dette er den anbefalte bruken
- **Testbar**: Hver side kan testes individuelt etter endring
- **Reversibel**: Om noe uventet oppstar, kan endringene rulles tilbake per fil
