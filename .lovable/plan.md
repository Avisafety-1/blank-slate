

## Ressurskalender — Tidslinjevisning for ressurser

### Konsept
En ny fane/seksjon på Kalender-siden (`/kalender`) som viser en visuell tidslinje (Gantt-lignende) for droner, utstyr og personell. Hver ressurs vises som en rad, og oppdragstildelinger vises som fargede blokker langs tidsaksen. Konflikter (overlappende tildelinger) markeres visuelt med rød/oransje indikator.

### Visning
```text
  Ressurskalender — Uke 12, 2026
  ──────────────────────────────────────────────
           Man     Tir     Ons     Tor     Fre
  ──────────────────────────────────────────────
  DJI M30  [███ Oppdrag A ███]
                           [██ Oppdrag B ██]
  ──────────────────────────────────────────────
  Mavic 3         [█ Oppdrag C █]
  ──────────────────────────────────────────────
  Ola N.   [███ Oppdrag A ███]
                   [██ Oppdrag C ██]  ⚠️ konflikt
  ──────────────────────────────────────────────
```

### Implementering

**1. Ny komponent `src/components/dashboard/ResourceTimeline.tsx`**
- Henter alle oppdrag med status "Planlagt"/"Pågående" og deres tilknyttede ressurser via `mission_drones`, `mission_personnel`, `mission_equipment`
- Grupperer per ressurs (drone/person/utstyr)
- Rendrer en horisontal tidslinje for gjeldende uke med navigasjon forover/bakover
- Oppdragsblokker vises som fargede barer
- Overlappende tildelinger vises med advarsel-ikon og rød kantlinje
- Bruker eksisterende `checkTimeOverlap`-logikk fra `useResourceConflicts.ts`
- Klikk på en blokk åpner `MissionDetailDialog`

**2. Endre `src/pages/Kalender.tsx`**
- Legg til en Tabs-komponent (Radix Tabs, allerede installert) med to faner:
  - "Månedsoversikt" (eksisterende kalendervisning)
  - "Ressurskalender" (ny tidslinje-komponent)
- All eksisterende kode forblir uendret, bare wrappet i en tab

**3. Ingen databaseendringer**
- All data finnes allerede i `missions`, `mission_drones`, `mission_personnel`, `mission_equipment`
- RLS-policyer dekker allerede lesetilgang

### Omfang
- Uke-basert visning med pil-navigasjon
- Tre seksjoner: Droner, Personell, Utstyr
- Automatisk konflikt-deteksjon med visuell markering
- Responsiv: på mobil stables radene vertikalt med kompakt visning
- Klikk på oppdragsblokk viser detaljer

