
## Auto-velg dronetag basert på oppdrag

### Problem
Når en dronetag er tilknyttet en drone, og den dronen er tilknyttet et oppdrag, må brukeren fortsatt velge dronetagen manuelt i "Start flight"-dialogen. Dette bør skje automatisk.

### Datamodell
Koblingene i databasen er:
```text
mission_drones.mission_id → missions.id
mission_drones.drone_id   → drones.id
dronetag_devices.drone_id → drones.id
```

Så når et oppdrag velges:
1. Slå opp `mission_drones` for å finne tilknyttet drone
2. Slå opp `dronetag_devices` for å finne dronetag koblet til den dronen
3. Sett denne dronetagen som automatisk valgt

### Løsning

**Fil: `src/components/StartFlightDialog.tsx`**

**1. Oppdater `DronetagDevice`-interfacet** til å inkludere `drone_id`:
```typescript
interface DronetagDevice {
  id: string;
  name: string | null;
  callsign: string | null;
  drone_id: string | null;
}
```

**2. Oppdater spørringen** som henter dronetag-enheter til å inkludere `drone_id`:
```typescript
.select('id, name, callsign, drone_id')
```

**3. Legg til en ny `useEffect`** som kjøres når `selectedMissionId` endres. Den skal:
- Returnere tidlig hvis ingen oppdrag er valgt
- Hente tilknyttede droner for oppdraget fra `mission_drones`
- Finne om noen av de hentede dronetag-enhetene er koblet til en av disse dronene
- Dersom en match finnes: sett `selectedDronetagId` automatisk
- Dersom ingen match: ikke endre valget (la brukeren velge manuelt)

```typescript
useEffect(() => {
  if (!selectedMissionId || selectedMissionId === 'none') return;

  const autoSelectDronetag = async () => {
    // 1. Finn droner koblet til oppdraget
    const { data: missionDrones } = await supabase
      .from('mission_drones')
      .select('drone_id')
      .eq('mission_id', selectedMissionId);

    if (!missionDrones || missionDrones.length === 0) return;

    const droneIds = missionDrones.map(md => md.drone_id);

    // 2. Finn dronetag koblet til en av disse dronene
    const matchingDevice = dronetagDevices.find(
      device => device.drone_id && droneIds.includes(device.drone_id)
    );

    if (matchingDevice) {
      setSelectedDronetagId(matchingDevice.id);
    }
  };

  autoSelectDronetag();
}, [selectedMissionId, dronetagDevices]);
```

**4. Vis et informasjonsikon** i dronetag-velgeren når en dronetag er automatisk valgt, slik at brukeren vet at valget kom fra oppdraget:
- Legg til en `autoSelectedDronetag`-tilstand (boolean) som settes til `true` etter auto-valg
- Nullstill den når brukeren manuelt endrer valget
- Vis en liten hjelpetekst "Automatisk valgt fra oppdragets drone" under select-feltet dersom `autoSelectedDronetag` er `true`

### Berørte filer
- `src/components/StartFlightDialog.tsx` — eneste fil som må endres

### Viktige hensyn
- Auto-valget skjer **kun** i `live_uav`-modus (dronetag-seksjonen vises bare da)
- Dersom oppdraget har **flere droner** med dronetag, velges den første som matches
- Dersom oppdraget ikke har noen drone med tilknyttet dronetag, skjer ingenting — brukeren kan fortsatt velge manuelt
- Nullstilling ved lukking av dialog håndteres allerede av den eksisterende `useEffect` for `open === false`
