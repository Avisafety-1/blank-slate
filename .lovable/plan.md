

## Tre endringer: Opplæring-tilgang, ArduPilot-toggle, Upload-logikk

### 1. Opplæring-tabben: Kun AviSafe og moderselskap

**Nå:** Vises for alle selskaper som ikke er underavdeling (`!isChildCompany`).

**Endring i `src/pages/Admin.tsx`:**
- Tab-trigger og TabsContent for "training" får en ekstra sjekk: vises kun hvis selskapet er AviSafe (`companyName?.toLowerCase() === 'avisafe'`) ELLER selskapet er et morselskap med `parent_company_id === null` og `isSuperAdmin`.
- Enklere: Vi legger til en `training_enabled`-kolonne på companies, men det er overkill. I stedet bruker vi sjekken: `isSuperAdmin` (som betyr AviSafe superadmin) ELLER at dette er et morselskap uten parent (moderavdeling med admin-tilgang).

Vent — brukeren sa "AviSafe og moderavdeling". Det betyr moderselskaper (selskaper uten parent_company_id) skal ha tilgang. Underavdelinger skal ikke.

Egentlig er logikken allerede `!isChildCompany` — som matcher dette. Men brukeren vil at ALLE andre selskaper (som ikke er AviSafe eller et morselskap) skal se "side under utvikling". Men alle selskaper uten parent_company_id ER moderselskaper...

Kanskje meningen er at bare AviSafe-selskapet og selskaper som har underavdelinger (parent companies) skal ha tilgang? Eller kanskje det er ment at kun AviSafe-organisasjonen (inkl. moderselskapet) skal ha det?

Jeg tolker det som: Opplæring-tabben skal kun vises for selskaper som er AviSafe (superadmin) eller for admin i moderselskaper (ikke underavdelinger). For alle andre selskaper (vanlige selskaper uten underavdelinger som ikke er AviSafe), vis "Side under utvikling".

Gjeldende logikk (`!isChildCompany`) viser det for ALLE morselskaper. Brukeren vil begrense til kun AviSafe + morselskaper som faktisk har underavdelinger.

Enklest: Sjekk `isSuperAdmin || (isAdmin && departmentsEnabled && !isChildCompany)`. Da får kun AviSafe superadmins og administratorer i morselskaper med avdelinger tilgang. Andre ser "under utvikling".

Alternativt beholder vi tabben synlig men bytter innhold til "under utvikling" for de som ikke kvalifiserer. Det er penere UX.

**Løsning:**
- Behold tab-trigger synlig for `!isChildCompany` (som nå)
- I TabsContent: Sjekk `isSuperAdmin || departmentsEnabled`. Hvis ikke → vis "Side under utvikling"-melding. Ellers → vis `<TrainingSection />`.

### 2. Ny toggle: `ardupilot_enabled` i selskapsstyring

**Database:** Ny kolonne `ardupilot_enabled boolean default false` på `companies`.

**`src/components/admin/CompanyManagementSection.tsx`:**
- Legg til `ardupilot_enabled` i Company-interface og select-query
- Ny toggle ved siden av DJI-togglen: "ArduPilot Flylogg"
- Enkel `handleToggleArdupilot` som oppdaterer `companies.ardupilot_enabled`
- Badge "ArduPilot" i kompakt visning

### 3. Upload-dialog tilpasses basert på toggles

**Logikk:**
- **Begge enablet (DJI + ArduPilot):** Nåværende oppførsel — vis method-valg (manuell/cloud) + loggtype-velger
- **Kun ArduPilot enablet:** Kun manuell opplasting (skip method-step, gå rett til upload). Ingen cloud/DJI-konto. Loggtype settes til `ardupilot` automatisk, ingen loggtype-velger
- **Kun DJI enablet:** Gammel oppførsel — method-valg (manuell/cloud), INGEN loggtype-velger (alt er DJI)
- **Ingen enablet:** Bør egentlig ikke kunne åpne dialogen, men fallback til kun DJI-oppførsel

**`src/components/UploadDroneLogDialog.tsx`:**
- Hent `ardupilot_enabled` og `dji_flightlog_enabled` fra company-data (via en liten query eller prop)
- Styr visibility av method-step, cloud-knapp og loggtype-velger basert på disse

### Filer som endres

| Fil | Endring |
|-----|---------|
| **Migration** | `ALTER TABLE companies ADD COLUMN ardupilot_enabled boolean DEFAULT false` |
| `src/pages/Admin.tsx` | Training TabsContent: vis "under utvikling" for selskaper uten tilgang |
| `src/components/admin/CompanyManagementSection.tsx` | Legg til ArduPilot-toggle, interface, handler |
| `src/components/UploadDroneLogDialog.tsx` | Hent company settings, tilpass method-step og loggtype-velger |

### Upload-dialog detaljer

```text
┌─────────────────────────────────────────┐
│ DJI=true, ArduPilot=true                │
│ → Vis method (manuell/cloud)            │
│ → Vis loggtype-velger på upload-step    │
├─────────────────────────────────────────┤
│ DJI=true, ArduPilot=false               │
│ → Vis method (manuell/cloud)            │
│ → Ingen loggtype-velger (alt er DJI)    │
├─────────────────────────────────────────┤
│ DJI=false, ArduPilot=true               │
│ → Skip method, gå direkte til upload    │
│ → Ingen loggtype-velger (alt er ArduPi) │
│ → Ingen cloud-knapp                     │
├─────────────────────────────────────────┤
│ Ingen enablet                           │
│ → Dialogen bør ikke åpnes (addon-sjekk) │
└─────────────────────────────────────────┘
```

