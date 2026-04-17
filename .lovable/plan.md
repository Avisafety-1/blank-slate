

## Mål
Teknisk ansvarlig på en drone skal kunne utføre inspeksjon (manuell + via sjekkliste) selv om dronen er eid av et annet selskap (f.eks. mor-avdeling) og delt nedover.

## Utforskning nødvendig

Sjekke:
1. RLS-policy på `drones` UPDATE — hvem kan oppdatere `sist_inspeksjon`, `neste_inspeksjon`, `hours_at_last_inspection` osv.
2. RLS-policy på `drone_inspections` INSERT
3. Hvordan teknisk ansvarlig er lagret på drone-raden (sannsynligvis `technical_responsible_id` eller lignende)
4. UI-gating i `DroneDetailDialog` / `ChecklistExecutionDialog` — om "Utfør inspeksjon"-knappen vises for teknisk ansvarlig på en delt drone

## Forventet rotårsak

Sannsynlig mønster (gjentar fra tidligere DJI-loggsak):
- `drones` UPDATE-policy krever `company_id = profile.company_id` → teknisk ansvarlig i underavdeling kan ikke oppdatere mor-avdelingens drone
- `drone_inspections` INSERT krever samme → kan ikke logge inspeksjonen
- UI skjuler kanskje også knappen basert på eierskap, ikke teknisk ansvar

## Plan

### 1. Database-revisjon
Hent RLS-policyer for `drones` (UPDATE) og `drone_inspections` (INSERT). Sjekk hvilken kolonne som lagrer teknisk ansvarlig (sannsynligvis `teknisk_ansvarlig_id` eller `technical_responsible_id`).

### 2. Migrasjon — utvid policyer
Mønster:
```sql
-- drones UPDATE: tillat eier ELLER teknisk ansvarlig
CREATE POLICY "Tech responsible can update assigned drone"
ON public.drones FOR UPDATE TO authenticated
USING (
  company_id = ANY(get_user_visible_company_ids(auth.uid()))
  OR teknisk_ansvarlig_id = auth.uid()
)
WITH CHECK (
  company_id = ANY(get_user_visible_company_ids(auth.uid()))
  OR teknisk_ansvarlig_id = auth.uid()
);

-- drone_inspections INSERT: tillat hvis bruker er teknisk ansvarlig på dronen
CREATE POLICY "Tech responsible can log inspections"
ON public.drone_inspections FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR drone_id IN (SELECT id FROM drones WHERE teknisk_ansvarlig_id = auth.uid())
  )
);
```

Behold eksisterende policyer — legg til som tillegg, ikke erstatt.

### 3. Frontend-justering i `DroneDetailDialog`
Sørge for at "Utfør inspeksjon"-knappen og sjekkliste-utførelse er synlig hvis:
- Bruker er admin i eier-/synlig selskap, **ELLER**
- Bruker er teknisk ansvarlig på dronen (uavhengig av selskap)

Sjekke samme gating i `ChecklistExecutionDialog` for inspeksjons-sjekklister.

### 4. `performDroneInspection` (`src/lib/droneInspection.ts`)
Verifisere at `companyId` som sendes inn er **brukerens** selskap (ikke dronens), slik at INSERT-policyen passerer. Hvis koden i dag sender dronens `company_id` → endre til brukerens.

### 5. Verifisering
- Logg inn som teknisk ansvarlig i underavdeling
- Åpne delt drone fra mor-avdeling
- Kjør "Utfør inspeksjon" (manuell) → skal lagre + oppdatere `sist_inspeksjon`
- Kjør inspeksjons-sjekkliste → skal fullføre + opprette `drone_inspections`-rad
- Bekreft at andre brukere i underavdelingen (uten teknisk ansvar) **ikke** kan utføre inspeksjon

### Filer
- Migrasjon: utvid `drones` UPDATE og `drone_inspections` INSERT policyer
- `src/components/resources/DroneDetailDialog.tsx`: utvid gating for inspeksjons-UI
- `src/components/resources/ChecklistExecutionDialog.tsx`: samme gating hvis nødvendig
- `src/lib/droneInspection.ts`: verifiser at brukerens `companyId` brukes

