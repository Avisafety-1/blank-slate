

## Plan: Teknisk ansvarlig for droner

### Oversikt
Legg til rollen "Teknisk ansvarlig" som kan tildeles personell, og knytt en teknisk ansvarlig til hver drone. Kun denne personen kan utføre inspeksjon/vedlikehold og motta e-postvarsler.

### 1. Database-migrasjon

**Ny kolonne på `drones`-tabellen:**
- `technical_responsible_id UUID REFERENCES profiles(id) ON DELETE SET NULL` — peker til personen som er teknisk ansvarlig for dronen

**Ny kolonne på `profiles`-tabellen:**
- `is_technical_responsible BOOLEAN DEFAULT false` — markerer at personen har rollen "Teknisk ansvarlig"

### 2. DroneDetailDialog — Redigeringsmodus

Legg til et nytt felt i redigeringsvisningen:
- **Dropdown**: "Teknisk ansvarlig" — viser en `SearchablePersonSelect` med alle profiler i avdelingen (`company_id`) som har `is_technical_responsible = true`
- Lagres som `technical_responsible_id` på dronen
- I visningsmodusen vises navnet på den teknisk ansvarlige

### 3. DroneDetailDialog — Inspeksjonstilgangskontroll

Endre "Utfør inspeksjon"-knappen:
- Hvis dronen har en `technical_responsible_id` satt, og innlogget bruker (`user.id`) ikke matcher denne, deaktiver knappen og vis en tooltip/tekst: "Kun teknisk ansvarlig kan utføre inspeksjon"
- Gjelder for både manuell inspeksjon og sjekkliste-inspeksjon

### 4. Kalender-inspeksjon

Oppdater inspeksjons-logikken i `Kalender.tsx`:
- Sjekk `technical_responsible_id` mot innlogget bruker før inspeksjon tillates

### 5. ProfileDialog / Ressurser — Rollen "Teknisk ansvarlig"

Legg til en toggle/checkbox i `PersonCompetencyDialog` eller `ProfileDialog` (admin-redigerbart) for å sette `is_technical_responsible = true` på en profil. Kun administratorer kan endre dette feltet.

I Ressurser-siden: vis "Teknisk ansvarlig" som en badge på personellkort der det er satt.

### 6. Vedlikeholdsvarsler — E-postfiltrering

Oppdater `check-maintenance-expiry` edge-funksjonen:
- For droner med `technical_responsible_id` satt: send kun vedlikeholdsvarsel til denne personen (ikke til alle administratorer i selskapet)
- For droner uten teknisk ansvarlig: behold eksisterende oppførsel (varsel til alle med notifikasjoner aktivert)

### Filer som endres
- Ny migrasjon (1 SQL-fil)
- `src/components/resources/DroneDetailDialog.tsx` — dropdown + tilgangskontroll
- `src/pages/Kalender.tsx` — tilgangskontroll for inspeksjon
- `src/components/resources/PersonCompetencyDialog.tsx` — toggle for rollen
- `src/pages/Resources.tsx` — badge for teknisk ansvarlig
- `supabase/functions/check-maintenance-expiry/index.ts` — filtrert varselruting

