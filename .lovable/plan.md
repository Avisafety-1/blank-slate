# Fiks: «Kan ikke knytte dokument til drone etter flytting»

## Årsak

Ikke et storage-problem — selve filen ligger trygt i `documents`-bucketen.

To ting kombinerer seg i `public.transfer_drone(...)`:

1. **`drone_documents` har en `company_id`-kolonne** med RLS-policy:
   `company_id = (select company_id from profiles where id = auth.uid())`
2. **`transfer_drone` oppdaterer aldri `drone_documents.company_id`** når drona flyttes. Den oppdaterer drones, drone_log_entries, drone_inspections og drone_equipment_history — men link-raden mellom drone og dokument blir værende med kildeavdelingens `company_id`.

Resultat for bruker i målavdelingen:
- Dokumentet selv flyttes (vises i `/dokumenter`).
- Link-raden i `drone_documents` er **usynlig** for dem (feil company_id).
- Når de prøver å re-tilknytte dokumentet, insertes ny rad med target `company_id` → bryter `UNIQUE (drone_id, document_id)` → feilmelding.

(`drone_equipment`, `drone_personnel`, `mission_drones` har ingen `company_id`-kolonne, så de er upåvirket.)

## Endring

Én migration som patcher `public.transfer_drone(...)`: legg til ett ekstra UPDATE rett etter de andre kaskade-oppdateringene (mellom dagens linje 117 og 119):

```sql
UPDATE public.drone_documents
   SET company_id = _to_company_id
 WHERE drone_id = _drone_id;
```

Dette gjelder uansett action — `move`/`share` beholder linken (nå synlig i målavdelingen), og `leave` sletter raden senere i samme funksjon, så den ekstra oppdateringen er trygg.

Ingen frontend-, RLS- eller storage-policy-endringer.

## Backfill av eksisterende skjeve rader (engangs)

For droner som allerede er flyttet før fiksen, finnes det `drone_documents`-rader hvor `company_id` ≠ dronens nåværende `company_id`. Disse må rettes opp engang, ellers ser brukerne fortsatt samme feil for tidligere flyttede droner:

```sql
UPDATE public.drone_documents dd
   SET company_id = d.company_id
  FROM public.drones d
 WHERE dd.drone_id = d.id
   AND dd.company_id <> d.company_id;
```

## Verifisering

1. Flytt en drone med tilknyttet dokument, velg «Flytt med».
2. Bytt til målavdelingen — dokumentet skal allerede vises som tilknyttet drona (uten å måtte re-tilknytte).
3. Prøv å fjerne og legge til igjen — ingen unique-feil.
4. SQL-sjekk: `select count(*) from drone_documents dd join drones d on d.id=dd.drone_id where dd.company_id <> d.company_id;` skal være 0.
