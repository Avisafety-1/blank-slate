

## Plan: Avdelingssynlighet for droner og utstyr

### Konsept
Legg til mulighet for å styre hvilke avdelinger en drone eller utstyr skal være synlig for. Administratorer kan velge avdelinger via en `DepartmentChecklist` (samme komponent som brukes for godkjenner/oppfølgingsansvarlig). Default: kun synlig for selskapet/avdelingen ressursen tilhører.

### Database (2 nye tabeller + RLS)

**Tabell: `drone_department_visibility`**
- `id` (uuid, PK)
- `drone_id` (uuid, FK → drones.id ON DELETE CASCADE)
- `company_id` (uuid, FK → companies.id ON DELETE CASCADE) — avdelingen dronen skal være synlig for
- `created_at` (timestamptz)
- UNIQUE(drone_id, company_id)
- RLS: Administratorer kan lese/skrive basert på `get_user_visible_company_ids`

**Tabell: `equipment_department_visibility`**
- Identisk struktur med `equipment_id` i stedet for `drone_id`

**Oppdatert RLS på `drones` og `equipment`**:
SELECT-policyen utvides til å også inkludere rader der ressursens ID finnes i synlighetstabellen for en av brukerens synlige selskaper. Dette gjøres med en `OR EXISTS`-sjekk.

### Frontend-endringer

**Fil: `src/components/resources/DroneDetailDialog.tsx`**
1. I redigeringsmodus: Hent `childCompanies` (avdelinger under morselskapet) og nåværende synlighetsvalg fra `drone_department_visibility`
2. Vis en `DepartmentChecklist`-seksjon med label «Synlig for avdelinger» — kun synlig for administratorer og kun når selskapet har underavdelinger
3. Ved lagring: Synkroniser valgte avdelinger (slett alle eksisterende + insert nye rader)
4. «Alle avdelinger» = insert rad for hver avdeling

**Fil: `src/components/resources/EquipmentDetailDialog.tsx`**
- Identisk logikk som for droner, men mot `equipment_department_visibility`

**Fil: `src/pages/Resources.tsx`**
- Oppdater drones/equipment-spørringene til å inkludere ressurser som er synlige via synlighetstabellene (dette håndteres primært av RLS, men dersom RLS ikke dekker det fullt ut, legges en `or`-filter til i spørringen)

### Rolletilgang
- Kun `administrator` og `superadmin` ser og kan endre avdelingssynlighet
- Vanlige brukere (`bruker`) ser ikke dette feltet i redigeringsvisningen

### Teknisk detalj
- Gjenbruker `DepartmentChecklist`-komponenten som allerede finnes
- Henter avdelinger med `companies.parent_company_id = companyId` (samme mønster som Admin.tsx)
- Synkroniseringslogikk ved lagring: `DELETE FROM drone_department_visibility WHERE drone_id = X`, deretter `INSERT` for valgte avdelinger

