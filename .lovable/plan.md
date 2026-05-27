## Diagnose

To deler i tilbakemeldingen, samme tema:

**A) Batterier bør knyttes permanent til drone via flylogg-import**
I `UploadDroneLogDialog.tsx` finnes `ensureDroneEquipmentHistory` (linje 1549–1578) som logger "added" til **`drone_equipment_history`** (audit) — men den skriver *aldri* til selve koblingstabellen **`drone_equipment`**. Det er sistnevnte som `DroneDetailDialog` leser for å vise tilknyttet utstyr på dronekortet (linje 422/713) og som `AddEquipmentToDroneDialog` inserter til manuelt. Resultatet: batteriet vises på flyloggen, men dukker aldri opp på dronekortet før noen manuelt kobler det.

Tabellen har unique-constraint `(drone_id, equipment_id)` — vi kan trygt bruke upsert med `ignoreDuplicates`.

**B) Underavdeling kan ikke redigere utstyr eid av mor-selskap**
Speilbilde av drone-fiksen som ble gjort i `DroneDetailDialog` (chatlogg #7336–#7337): RLS-UPDATE-policy på `equipment` krever `company_id = get_user_company_id(auth.uid())`, så lagring fra avdeling på et delt utstyr blir stille blokkert. `EquipmentDetailDialog.tsx` har ingen tilsvarende read-only-modus i dag. `Equipment`-interfacet mangler `company_id` og `companies`, men datakilden (`Resources.tsx` linje 231) selecter allerede `*, companies(navn)`, så feltene er tilgjengelige på runtime.

## Fiks

### 1. `src/components/UploadDroneLogDialog.tsx`
- Ny state: `const [linkBatteryToDrone, setLinkBatteryToDrone] = useState(true);` (default på).
- I "Utstyr"-seksjonen (linje ~2305): rett under valgt-utstyr-liste, vis en checkbox **kun** når både `selectedDroneId` er satt og minst ett valgt utstyr er batteri-type (`isBatteryType(eq.type)`):
  > "Knytt batteri til {terminology.vehicleLower} (vises på {terminology.vehicleLower}kortet)"
- Utvid `ensureDroneEquipmentHistory` (eller lag søsterfunksjon `ensureDroneEquipmentLink`) som — når `linkBatteryToDrone` er true — også gjør:
  ```ts
  await supabase.from('drone_equipment').upsert(
    batteryEquipment.map(b => ({ drone_id: selectedDroneId, equipment_id: b.id })),
    { onConflict: 'drone_id,equipment_id', ignoreDuplicates: true }
  );
  ```
  Den eksisterende history-skrivingen beholdes (audit-spor).
- Kalles fra de samme tre stedene som dagens funksjon (linje 1796 / 1870 / 1943).
- Når brukeren har huket av og batteriet ble linket: kort toast "Batteri knyttet til {terminology.vehicleLower}".

### 2. `src/components/resources/EquipmentDetailDialog.tsx`
Speile drone-fiksen:
- Utvid `Equipment`-interfacet med `company_id?: string` og `companies?: { navn?: string } | null`.
- Beregn `const isSharedFromParent = !!equipment.company_id && !!companyId && equipment.company_id !== companyId;`.
- I `DialogHeader` rett under tittel/loggbok-knapp: vis read-only-banner når `isSharedFromParent`:
  > "🔒 Dette utstyret er delt fra {equipment.companies?.navn || 'mor-selskapet'} og kan kun redigeres derfra."
- I footer (linje 958): `disabled={isSharedFromParent}` på Rediger-knappen.
- Skjul også vedlikeholds-/slett-knapper når delt fra mor (for å unngå stille RLS-feil). Loggbok og sjekkliste-visning forblir tilgjengelig.

## Verifisering

1. Last opp DJI-flylogg med drone X og batteri Y: standard nå er huket av → batteri Y dukker opp under "Tilknyttet utstyr" på `DroneDetailDialog` for drone X uten manuell handling.
2. Hak vekk valget → batteri opprettes/oppdateres som vanlig, men ingen ny `drone_equipment`-rad legges til.
3. Som admin i underavdeling: åpne et utstyr eid av mor-selskap → banner vises, Rediger er disabled. Sjekk at fra mor-selskap kan utstyret redigeres som før.
4. Eksisterende `drone_equipment_history`-flow er uendret (audit beholdes).

## Tekniske detaljer

- Påvirkede filer: `src/components/UploadDroneLogDialog.tsx`, `src/components/resources/EquipmentDetailDialog.tsx`.
- Ingen DB-migrasjon: `drone_equipment` finnes, har riktig unique-constraint og RLS tillater allerede insert fra eier-selskapets brukere (samme tilgang som manuell linking via `AddEquipmentToDroneDialog`).
- Ingen endring i `DroneDetailDialog` (lese-flow fungerer automatisk når lenker eksisterer).
