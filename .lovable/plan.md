

## Plan: Ninox-godkjenning for oppdrag i 5 km RPAS-soner

### Oversikt
Når et oppdrag befinner seg innenfor en 5 km RPAS-sone rundt en flyplass, skal systemet:
1. Vise «Søk godkjenning i Ninox» i luftromsadvarselen
2. Vise en klikkbar badge «Ikke godkjent i Ninox» på oppdragskortet
3. La brukeren bekrefte Ninox-godkjenning via en dialog (fra badge eller StartFlightDialog)
4. Blokkere flytur-start dersom Ninox-godkjenning mangler

### 1. Database-migrasjon

Legg til én kolonne på `missions`-tabellen:

```sql
ALTER TABLE missions ADD COLUMN ninox_approved boolean DEFAULT false;
```

### 2. AirspaceWarnings — legg til Ninox-tekst + callback

**`src/components/dashboard/AirspaceWarnings.tsx`**:
- For 5KM-soner (`is5km`), legg til teksten «Søk godkjenning i Ninox» i meldingen
- Eksporter også en hjelpefunksjon/info om at advarselen inneholder 5KM-soner, slik at konsumenter kan bruke den

### 3. Ninox-statusberegning for oppdrag

Trenger å vite om oppdraget er innenfor en 5KM-sone. To tilnærminger:
- **Alternativ A**: Kall `check_mission_airspace` RPC og sjekk for 5KM-treff. Gjøres allerede av `AirspaceWarnings`-komponenten.
- **Valgt tilnærming**: Legg til en `onAirspaceResult`-callback prop på `AirspaceWarnings` som returnerer warning-listen. Overordnet komponent kan da sjekke om 5KM finnes og vise Ninox-badge.

### 4. MissionCard — Ninox-badge

**`src/components/oppdrag/MissionCard.tsx`**:
- Legg til lokal state `has5kmZone` som settes via `onAirspaceResult` callback fra `AirspaceWarnings`
- Vis en badge «Ikke godkjent i Ninox» (rød/grå) eller «Godkjent i Ninox» (grønn) basert på `mission.ninox_approved` og `has5kmZone`
- Badge vises KUN hvis oppdraget er i en 5KM-sone
- Klikk på badge åpner en `AlertDialog` med tekst: «Ditt oppdrag krever godkjenning i Ninox: Bekreft at du har innhentet dette»
- Ved bekreftelse: oppdater `missions.ninox_approved = true` i Supabase og kall `fetchMissions`

### 5. StartFlightDialog — Ninox-sjekk

**`src/components/StartFlightDialog.tsx`**:
- Når et oppdrag er valgt, sjekk via `check_mission_airspace` RPC om det er i en 5KM-sone
- Hvis ja og `ninox_approved === false`: vis en advarsel og en knapp for å bekrefte Ninox-godkjenning inline
- Blokkér «Start flytur»-knappen inntil Ninox er bekreftet (legg til i `disabled`-betingelsen)
- Hent `ninox_approved`-status sammen med misjonsdataene (utvid select-spørringen)

### 6. MissionDetailDialog (dashboard)

**`src/components/dashboard/MissionDetailDialog.tsx`**: Tilsvarende badge-logikk som MissionCard — vises kun ved 5KM-sone.

### Filer som endres
1. **Database-migrasjon** — 1 ny kolonne (`ninox_approved`)
2. `src/components/dashboard/AirspaceWarnings.tsx` — Ninox-tekst i 5KM-meldinger + `onAirspaceResult` callback
3. `src/components/oppdrag/MissionCard.tsx` — Ninox-badge med bekreftelsesdialog
4. `src/components/StartFlightDialog.tsx` — Ninox-sjekk, bekreftelsesmulighet, blokkering
5. `src/components/dashboard/MissionDetailDialog.tsx` — Ninox-badge
6. `src/hooks/useOppdragData.ts` — Hent `ninox_approved` (allerede inkludert via `select *`)

