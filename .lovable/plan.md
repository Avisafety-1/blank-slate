## Ren frontend-fix av `handleDeleteEntry` i `FlightLogbookDialog.tsx`

FK `flight_log_personnel.flight_log_id → flight_logs(id)` er bekreftet `ON DELETE CASCADE`, så sletting av `flight_logs` rydder automatisk i `flight_log_personnel`. Ingen DB-endringer.

### Endringer (linjer 433–530)

**1. Erstatt embedded eier-sjekk med to enkle queries (Case 1)**

```ts
const { data: fl, error: flGetErr } = await supabase
  .from("flight_logs")
  .select("id, entry_source")
  .eq("id", entry.flight_log_id)
  .maybeSingle();
if (flGetErr) throw flGetErr;
if (!fl || fl.entry_source !== "manual") { ambiguousToast(); return; }

const { data: flpRows, error: flpGetErr } = await supabase
  .from("flight_log_personnel")
  .select("profile_id")
  .eq("flight_log_id", entry.flight_log_id);
if (flpGetErr) throw flpGetErr;
if (!flpRows?.some(r => r.profile_id === personId)) { ambiguousToast(); return; }
```

**2. Dato-normalisering i Case 2**

`entry.entry_date` er `timestamptz` og kommer tilbake som `"YYYY-MM-DDT00:00:00+00:00"`. Normaliser før sammenligning:

```ts
const entryDateStr = String(entry.entry_date).slice(0, 10);
const sameDay = (candidates || []).filter((c: any) => {
  const d = new Date(c.flight_date);
  const local = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const utc = d.toISOString().slice(0,10);
  return local === entryDateStr || utc === entryDateStr;
});
```

Behold de øvrige to enkle queries for kandidater (kan beholdes med `flight_log_personnel!inner(profile_id)` siden den fungerer som filter her, men eier-sjekken skjer reelt via den påfølgende slettings-verifikasjonen).

**3. Slett `flight_logs` først, verifiser med `.select("id")`, og avbryt hvis 0 rader**

Felles slette-sekvens for både Case 1 og Case 2 (CASCADE fjerner `flight_log_personnel` automatisk):

```ts
const { data: flDel, error: flErr } = await supabase
  .from("flight_logs")
  .delete()
  .eq("id", flightLogId)
  .select("id");
if (flErr) throw flErr;
if (!flDel || flDel.length === 0) {
  // RLS blokkerte stille eller raden var allerede borte
  ambiguousToast();
  await Promise.all([fetchFlightLogs(), fetchProfileData(), fetchPersonnelLogs()]);
  return;
}

// Først NÅ er det trygt å slette logginnlegget
const { data: pleDel, error: pleErr } = await supabase
  .from("personnel_log_entries")
  .delete()
  .eq("id", entry.id)
  .select("id");
if (pleErr) throw pleErr;
```

Fjern eksplisitt `flight_log_personnel.delete()` før `flight_logs.delete()` — CASCADE håndterer den.

**4. Case 3 (vanlig notat) uendret** — sletter kun `personnel_log_entries`.

**5. Beholdt:** `ambiguousToast`, `parseManualDurationMinutes`, refetch + `queryClient.invalidateQueries` ved suksess, toast-meldinger.

### Sluttresultat

- Logginnlegget kan ALDRI bli slettet uten at tilhørende flytur også er slettet.
- Hvis RLS stille blokkerer `flight_logs.delete()`, vises toast og ingenting slettes.
- DB-trigger `tg_flp_recompute_pilot` (AFTER DELETE på `flight_log_personnel`, fyrt via CASCADE) recomputer `profiles.flyvetimer` korrekt.
- Frontend henter ny sum via `fetchFlightLogs` → "Total flytid" og "Manuelt lagt til" oppdateres umiddelbart i dialogen.

### Ikke endret

- Ingen migrasjoner, ingen DB-funksjoner, ingen backfill, ingen triggerendringer.
