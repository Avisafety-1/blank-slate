# Fix: vis alle Planlagt/Pågående oppdrag på dashbordet

## Rotårsak

Dashbordets oppdragsfilter i `MissionsSection.tsx` kombinerer statussjekk med en tidssjekk på `slutt_tidspunkt`/`tidspunkt`. Tensio Nord-oppdraget `Tevla 132kV befaring` (status `Planlagt`, start 08:00, slutt satt lik start) faller derfor bort så snart klokken passerer 08:00 — selv om det fortsatt er planlagt.

## Endring

`src/components/dashboard/MissionsSection.tsx` (linje 100-106):

Fjern hele `.or(...)`-klausulen og 24-timersvinduet. Behold kun statusfilter:

```ts
const query = (supabase as any)
  .from("missions")
  .select("*, companies:company_id(id, navn)")
  .neq("status", "Fullført")
  .neq("status", "Avlyst")
  .order("tidspunkt", { ascending: true });
```

`oneDayAgo`/`nowIso` kan fjernes siden de ikke lenger brukes.

## Effekt

- Alle oppdrag med status `Planlagt` eller `Pågående` vises på dashbordet, uavhengig av om `slutt_tidspunkt` er satt eller har passert.
- `Fullført` og `Avlyst` skjules som før.
- Brukeren må endre status manuelt (eller via eksisterende automatikk) for at et oppdrag skal forsvinne fra dashbordet.

## Omfang

- 1 fil, ~6 linjer endret.
- Ingen RLS-, auth-, realtime- eller backend-endringer.
- Ingen endring i opprett-/rediger-dialoger eller andre visninger.

## Risiko

Svært lav. Filteret blir mer tillatende — ingen oppdrag som tidligere ble vist forsvinner. Eneste bivirkning: gamle "glemte" oppdrag som aldri ble markert `Fullført` vil dukke opp i lista. Hvis det blir et problem senere kan vi legge til en grense (f.eks. skjul Planlagt eldre enn 30 dager), men det holdes utenfor nå.
