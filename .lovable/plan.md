
## Legge til brytervalg for ECCAIRS-tilgang og oppfølgingsansvarlig på personell

### Hva som skal endres

Tre ting håndteres i denne leveransen:

**1. Database — to nye kolonner på profiles**
```sql
ALTER TABLE profiles
  ADD COLUMN can_access_eccairs boolean NOT NULL DEFAULT false,
  ADD COLUMN can_be_incident_responsible boolean NOT NULL DEFAULT false;
```

**2. Admin.tsx — UI og logikk**

- `Profile`-interfacet utvides med to nye felt
- To nye toggle-funksjoner: `toggleEccairs()` og `toggleIncidentResponsible()`
- Desktop/Pad: Switch-boksen som i dag viser «Godkjenner» endres til «Godkjenner for oppdrag» (forklarende tekst), og to nye Switch-bokser legges til
- Mobil (Popover-kort): To nye Switch-rader legges til under eksisterende «Kan godkjenne oppdrag»

Desktop-rad (fra venstre): Navn/e-post — [Godkjenner for oppdrag ⚡] — [ECCAIRS-tilgang 📋] — [Oppfølgingsansvarlig 🔔] — [Rollevalg] — [Slett]

Mobil-popover:
```
Kan godkjenne oppdrag          [Switch]
ECCAIRS-tilgang                [Switch]
Oppfølgingsansvarlig (hendelser) [Switch]
Rolle:                         [Rollevalg]
[Slett bruker]
```

**3. IncidentDetailDialog.tsx — filtrering av nedtrekksliste**

I `fetchUsers`-funksjonen endres spørringen fra å hente alle godkjente brukere til å hente kun de med `can_be_incident_responsible = true`:

```typescript
// Før:
.from('profiles')
.select('id, full_name')
.eq('approved', true)

// Etter:
.from('profiles')
.select('id, full_name')
.eq('approved', true)
.eq('can_be_incident_responsible', true)
```

Dette betyr at kun brukere med bryteren aktiv dukker opp i valglisten «Oppfølgingsansvarlig (Admin)» i hendelses-dialogen.

### Filer som endres

| Fil | Endring |
|---|---|
| `supabase/migrations/[ts]_add_profile_permission_flags.sql` | Ny migrering: legg til `can_access_eccairs` og `can_be_incident_responsible` på profiles |
| `src/integrations/supabase/types.ts` | Legg til de to nye feltene i profiles Row/Insert/Update-typer |
| `src/pages/Admin.tsx` | Oppdater `Profile`-interface, legg til to toggle-funksjoner, oppdater desktop og mobil UI |
| `src/components/dashboard/IncidentDetailDialog.tsx` | Filtrer `fetchUsers` på `can_be_incident_responsible = true` |

### Forventet resultat

- Admin kan sette ECCAIRS-tilgang og oppfølgingsansvarlig-rolle direkte på personkortet
- På mobil: via Popover-kortet med tre brytervalg
- På desktop/pad: tre Switch-bokser inline i brukerlisten med forklarende tekst
- I hendelsesdialogen: kun brukere med «Oppfølgingsansvarlig»-bryteren aktiv vises i nedtrekkslisten
- Eksisterende «Godkjenner»-tekst på desktop rettes til «Godkjenner for oppdrag»
