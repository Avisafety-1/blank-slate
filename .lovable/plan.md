

## Ressurskalender — 4 fixes

**Fil: `src/components/dashboard/ResourceTimeline.tsx`**

### 1. Klikkbare vedlikeholdselementer
Legg til state for en vedlikeholds-popover/dialog. Ved klikk på maintenance-events, vis en enkel Dialog med tittel, ressursnavn, dato og type (inspeksjon/vedlikehold). Lagre ekstra metadata på `TimelineEvent` (resourceName, resourceType) for visning.

### 2. Filtrer rader per uke (kun rader med synlige events)
Flytt filtreringen fra `hasAnyEvents` (som sjekker totalt) til `renderSection` — filtrer `rows` til kun de som har events innenfor `weekStartMs`–`weekEndMs`. Seksjoner uten synlige rader skjules automatisk (eksisterende `rows.length === 0` check på linje 306).

### 3. Skjul tomme seksjoner per uke
Følger automatisk av punkt 2 — `renderSection` returnerer `null` når filtrerte rader er tomme.

### 4. Oppdragsfarge matcher legend
Endre `renderEventBlock` slik at mission-events bruker `EVENT_COLORS.mission` (`bg-primary/80`) i stedet for `getMissionColor(event.id)` som gir tilfeldige farger. Dette matcher legend-fargen.

### Implementasjonsdetaljer

- Ny state: `maintenanceDetailOpen` + `selectedMaintenanceEvent` (med resourceName)
- Utvid `TimelineEvent` med valgfri `resourceName?: string`
- Sett `resourceName` ved opprettelse av maintenance-events (drone.modell / eq.navn)
- Enkel Dialog for vedlikeholdsdetaljer (dato, type, ressursnavn)
- `renderSection` filtrerer: `rows.filter(r => r.events.some(e => overlaps week))`
- Fjern `getMissionColor` — bruk `EVENT_COLORS[event.eventType]` for alle events

