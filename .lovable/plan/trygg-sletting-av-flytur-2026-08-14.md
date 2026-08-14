# Trygg sletting av flytur

Kort svar: slik koden står nå er sletting **nesten** trygg, men jeg fant tre svakheter som bør rettes før du bruker knappen. Ingen av dem sletter andre flyturer, men to av dem kan etterlate eller treffe feil loggbokoppføringer.

## Hva jeg har verifisert i databasen

- `flight_log_equipment`, `flight_log_personnel` og `flight_events` har `ON DELETE CASCADE` mot `flight_logs` — kun radene for akkurat denne flyturen fjernes.
- `personnel_log_entries` har `flight_log_id` med `ON DELETE SET NULL`.
- `drone_log_entries` og `equipment_log_entries` har **ingen** kobling til flyturen — kun `entry_date` + ressurs-id.
- Flytimer legges kun til ved INSERT (`trg_update_drone_hours`, `trg_update_equipment_hours`); ingen trigger trekker fra ved sletting. Pilotens timer beregnes på nytt automatisk.

## Problemene

1. **Pilotens loggbokoppføring blir liggende igjen.** Koden sletter flyturen først; da nuller databasen ut `flight_log_id`, og den etterfølgende slettingen finner ingenting. Resultatet er en foreldreløs oppføring i pilotens loggbok.
2. **Drone-/utstyrsloggen slettes på dato alene.** Alle oppføringer på samme drone med nøyaktig samme tidsstempel fjernes, uansett hvem som skrev dem eller hva de gjelder (f.eks. en manuell vedlikeholdsnotat lagt inn samtidig).
3. Flytimer trekkes fra etter slettingen; hvis noe feiler underveis kan timene bli stående.

## Endringer

**`src/lib/flightLogDeletion.ts`**
- Les og slett `personnel_log_entries` med `flight_log_id = <flyturen>` **før** flyturen slettes, slik at SET NULL ikke rekker å bryte koblingen.
- Snevre inn drone-/utstyrslogg-slettingen: kun oppføringer med `entry_type = 'Advarsel'` på nøyaktig samme `entry_date` og samme ressurs, og kun de som ble opprettet av flyturens egen opplasting (`user_id` lik flyturens `created_by`). Alt annet røres ikke.
- Beholde rekkefølgen der selve `flight_logs`-raden slettes med `.select()` slik at manglende rettighet stopper alt før opprydding.
- Trekke fra flytimer på drone og tilknyttet utstyr som i dag, med `Math.max(0, ...)`.

**`src/components/oppdrag/MissionCard.tsx`**
- Utvide bekreftelsesteksten til å liste konkret hva som slettes: flyturen, pilotens loggbokoppføring, eventuelle advarsler i drone-/utstyrsloggen, og hvor mange flytimer som trekkes fra.

**i18n**
- Oppdatere `deleteFlightDescription` i `no.json` og `en.json` til den mer presise teksten.

## Det som aldri berøres

Andre flyturer, andre oppdrag, andre personers loggbokoppføringer, telemetri på andre logger, og manuelle loggbokoppføringer (vedlikehold, notater) — disse ligger utenfor både cascade-koblingene og de innsnevrede filtrene.
