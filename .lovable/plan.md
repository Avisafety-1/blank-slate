

## Avdelingsbasert godkjenner — uten å påvirke dagens oppsett

### Tilnærming: Additivt, ikke erstattende

De eksisterende booleanene `can_approve_missions` og `can_be_incident_responsible` beholdes som de er. To nye kolonner legges til som **kun aktiveres når selskapet har avdelinger**. Selskaper uten avdelinger merker ingen endring.

### Database

Nye kolonner på `profiles`:
- `approval_company_ids text[]` — hvilke avdelinger brukeren er godkjenner for. `NULL` = følger eksisterende boolean (bakoverkompatibelt).
- `incident_responsible_company_ids text[]` — tilsvarende for hendelser.

Konvensjon: `['all']` = alle avdelinger. `['uuid1','uuid2']` = spesifikke. `NULL` = ikke i bruk (faller tilbake til boolean).

Ingen migrering av eksisterende data — NULL-verdier betyr at dagens boolean-logikk gjelder uendret.

### Admin UI (src/pages/Admin.tsx)

Kun for selskaper med avdelinger (`childCompanies.length > 0`):
- Når Switch for "Kan godkjenne oppdrag" slås på → vis en ekstra dropdown: "Alle avdelinger" / spesifikke avdelinger.
- Lagrer valget i `approval_company_ids`. Boolean `can_approve_missions` settes fortsatt til `true/false` for bakoverkompatibilitet.
- Tilsvarende for "Oppfølgingsansvarlig".
- Selskaper uten avdelinger: Ingen endring i UI — Switch fungerer akkurat som i dag.

### Filtreringslogikk

Alle steder som sjekker godkjennere oppdateres med en fallback:

```
// Pseudokode
if (approval_company_ids !== null) {
  // Ny logikk: sjekk om target company er i arrayet eller 'all'
} else {
  // Gammel logikk: bruk can_approve_missions boolean
}
```

**Berørte filer:**

| Fil | Endring |
|-----|---------|
| Ny migrasjon | `ALTER TABLE profiles ADD COLUMN approval_company_ids text[], ADD COLUMN incident_responsible_company_ids text[]` |
| `src/pages/Admin.tsx` | Multi-select dropdown ved avdelinger, lagrer array + boolean |
| `src/hooks/useOppdragData.ts` | Godkjenner-sjekk med fallback |
| `src/components/dashboard/MissionDetailDialog.tsx` | Godkjenner-sjekk med fallback |
| `src/components/dashboard/MissionsSection.tsx` | Godkjenner-sjekk med fallback |
| `src/components/ProfileDialog.tsx` | Hent ventende oppdrag filtrert på scope |
| `src/components/dashboard/IncidentDetailDialog.tsx` | Hendelsesansvarlig-filtrering |
| `src/components/dashboard/AddIncidentDialog.tsx` | Hendelsesansvarlig-filtrering |
| `src/components/dashboard/IncidentsSection.tsx` | Flagg-sjekk med fallback |
| `supabase/functions/send-notification-email/index.ts` | E-postvarsler til riktige godkjennere basert på scope |

### Sikkerhet

- Ingen RLS-endringer nødvendig — kolonnene er på brukerens egen profil
- Kun administratorer kan endre verdiene (eksisterende rollesjekk)
- Array-verdier valideres mot `childCompanies` i UI

### Oppsummert

- Selskaper uten avdelinger: **null endring** i oppførsel eller UI
- Selskaper med avdelinger: Ny dropdown dukker opp når Switch aktiveres
- Alle eksisterende booleaner beholdes og synkes

