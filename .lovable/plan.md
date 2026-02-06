
# Fix: Kritiske feil i offline flylogging

## Funn fra kodegjennomgang

Jeg kunne ikke gjennomfore en full nettlesertest fordi innlogging kreves, men en grundig kodegjennomgang avdekket **3 kritiske feil** som forhindrer at offline flylogging fungerer korrekt.

---

## Problem 1: LogFlightTimeDialog sine dropdowns er tomme offline

**Alvorlighetsgrad: KRITISK - blokkerer all offline-logging**

`LogFlightTimeDialog.tsx` henter droner, misjoner, personell og utstyr direkte fra Supabase uten offline-cache (linje 410-448). Nar brukeren er offline:
- Alle fire `fetch`-funksjoner feiler stille
- Dropdown-menyene for drone, pilot, misjon og utstyr er tomme
- Validering feiler med "Velg en drone" fordi ingen droner er tilgjengelige
- Brukeren nar aldri den offline-logikken (linje 543) fordi valideringen stopper dem forst

**Losning**: Legg til `setCachedData`/`getCachedData` i alle fire fetch-funksjoner i `LogFlightTimeDialog`, identisk med monsteret brukt i `Resources.tsx`.

---

## Problem 2: Drone-flytimer overskrives i stedet for a legges til

**Alvorlighetsgrad: KRITISK - datakorrumpering**

I offline-stien (linje 574-583) koes en `update`-operasjon som setter `flyvetimer` til kun den siste flyturens minutter:

```text
data: {
  flyvetimer: formData.flightDurationMinutes, // FEIL: Overskriver totalen
}
```

Men online-stien bruker en RPC-funksjon: `supabase.rpc('add_drone_flight_hours', {...})` som korrekt **legger til** minutter. Offline-koen stotter ikke RPC-kall, sa dette vil overskrive dronens totale flytimer med kun siste flytur.

**Losning**: Fjern drone-timer-oppdateringen fra offline-koen. Legg i stedet til en ny `rpc`-operasjonstype i offlineQueue, eller handter drone-timer-synkronisering som en del av flight_log-synkroniseringen via en database-trigger.

Den enkleste losningen: Opprett en database-trigger `on INSERT flight_logs` som automatisk oppdaterer `drones.flyvetimer`. Da trenger verken online- eller offline-stien a koe en separat oppdatering -- det skjer automatisk nar flyloggen synkroniseres.

---

## Problem 3: Utstyrs-flytimer og koblingstabeller mangler offline

**Alvorlighetsgrad: MEDIUM**

Offline-stien (linje 543-613) mangler:
- `flight_log_equipment`-oppforinger (utstyr koblet til flyloggen)
- `flight_log_personnel`-oppforinger (personell koblet til flyloggen)
- Utstyrsflytimerr-oppdateringer
- Automatisk misjon-opprettelse for ustrukturerte flyvninger

Disse finnes alle i online-stien (linje 617-776) men ble ikke implementert offline.

**Losning**: Koe alle sekundaere operasjoner som separate koeoppforinger, eller bruk database-triggere for automatisk opprettelse.

---

## Implementeringsplan

### Steg 1: Legg til offline-cache i LogFlightTimeDialog sine fetch-funksjoner

Oppdater de fire fetch-funksjonene i `LogFlightTimeDialog.tsx`:

```text
// fetchDrones - linje 410-418
const fetchDrones = async () => {
  try {
    const { data, error } = await supabase
      .from("drones")
      .select("id, modell, serienummer")
      .eq("aktiv", true)
      .order("modell");
    if (error) throw error;
    if (data) {
      setDrones(data);
      setCachedData(`offline_logflight_drones_${companyId}`, data);
    }
  } catch {
    if (!navigator.onLine && companyId) {
      const cached = getCachedData<Drone[]>(`offline_logflight_drones_${companyId}`);
      if (cached) setDrones(cached);
    }
  }
};
```

Samme monster for `fetchMissions`, `fetchPersonnel`, og `fetchEquipment`.

### Steg 2: Fiks drone-flytimer (database-trigger)

Opprett en database-trigger som automatisk oppdaterer `drones.flyvetimer` nar en ny `flight_log` settes inn:

```text
CREATE OR REPLACE FUNCTION update_drone_flight_hours_on_log()
RETURNS trigger AS $$
BEGIN
  UPDATE drones 
  SET flyvetimer = COALESCE(flyvetimer, 0) + NEW.flight_duration_minutes
  WHERE id = NEW.drone_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_drone_hours
  AFTER INSERT ON flight_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_drone_flight_hours_on_log();
```

Tilsvarende trigger for utstyrsflytimerr via `flight_log_equipment`.

Fjern den manuelle drone-timer-oppdateringen fra bade online- og offline-stien i LogFlightTimeDialog (forenkler koden).

### Steg 3: Koe sekundaere operasjoner offline

Utvid offline-stien med koing av:
- `flight_log_equipment` INSERT for hvert valgt utstyr
- `flight_log_personnel` INSERT for koblet personell og pilot  
- Automatisk misjon-opprettelse for flyvninger uten misjon

### Steg 4: Legg til RPC-stotte i offlineQueue (valgfritt)

Utvid `QueuedOperation`-interfacet med en `rpc`-operasjonstype:

```text
interface QueuedOperation {
  // ... eksisterende felt
  operation: 'insert' | 'update' | 'delete' | 'rpc';
  rpcName?: string;
  rpcArgs?: Record<string, unknown>;
}
```

Med tilhorende `executeOperation`-logikk. Men dette er valgfritt hvis database-triggere brukes.

---

## Endrede filer

| Fil | Endring |
|-----|---------|
| `src/components/LogFlightTimeDialog.tsx` | Legg til offlineCache import, oppdater alle 4 fetch-funksjoner med cache, utvid offline-stien med sekundaere operasjoner |
| `src/lib/offlineQueue.ts` | (Valgfritt) Legg til RPC-stotte |
| Ny migrasjon | Database-trigger for automatisk flytimer-oppdatering |

---

## Oppsummering

Etter disse fiksene vil offline flylogging fungere slik:

1. Bruker har vaert online -- dropdown-data er cachet i localStorage
2. Bruker gar offline -- banner viser "Du er frakoblet"
3. Bruker starter flytur -- lagres i localStorage + koes til database
4. Bruker stopper flytur -- LogFlightTimeDialog viser cachet droner, misjoner, personell
5. Bruker fyller ut og lagrer -- flylogg koes i offline-koen
6. Bruker far nett igjen -- koen prosesseres, flylogg insertes, trigger oppdaterer flytimer
7. Banner viser "Synkronisering fullfort"
