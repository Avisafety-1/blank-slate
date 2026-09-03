# Felles vedlikeholdskatalog (globale maler)

I dag er hver mal i `maintenance_schedule_presets` eid av ett selskap (`company_id` er påkrevd, og RLS viser kun maler i selskaper brukeren ser). Det finnes 5 maler totalt, alle i ett selskap. For å få en katalog "tilgjengelig for alle" må malene kunne være globale, uten å endre hvordan selskapenes egne maler virker i dag.

## Slik blir det

- Nedtrekket "Bruk lagret mal" får to grupper: **Katalog (Avisafe)** og **Egne maler**.
- Katalogmalene er lesbare for alle selskaper, men kan ikke redigeres eller slettes av vanlige brukere. Velger man en katalogmal fylles feltene inn, og man kan justere fritt før lagring på ressursen.
- "Lagre som mal" lagrer som i dag på eget selskap.
- Hver katalogmal viser en kort forklaring (kategori, modellfamilie, kilde) slik at man ser hvor tallet kommer fra.

## Katalogen som legges inn (basert på vedlegget)

DJI serviceprogram (timer / dager, "det som kommer først"):

- DJI Basic-service — 200 t / 180 dager (M200 V2, M300/M350, M30, Mavic 3E, M3D/3TD, M4-serien, M400, Phantom 4 RTK)
- DJI Standard-service — 400 t / 365 dager
- DJI Premium-service — 600 t / 545 dager (merknad: ikke tilbudt for M4-serien/M400)

Hard-time deler:

- Propellbytte M300 RTK — 300 t / 365 dager
- Propeller + gimbal-dempere (M30/M30T, Mavic 3E, M4-serien) — 200 t / 365 dager

Batteri:

- Batteri standardklasse (Mini/Air/Mavic) — 730 dager, merknad ~200 sykluser til 80 %
- Batteri enterprise (M30/M300/M350) — 730 dager, merknad ~200–400 sykluser
- Batteri høykapasitet (Dock/Agras-klassen) — 730 dager, merknad ~1500 sykluser
- Lagringsvedlikehold batteri (lad/utlad) — 90 dager

Fallskjerm/PRS:

- Ompakking fallskjerm/PRS — 365 dager (merknad: ompakking umiddelbart etter enhver utløsning)

Øvrig utstyr (våre anbefalte defaults, ikke produsentkrav):

- Fjernkontroll — inspeksjon/firmware 180 dager
- Lader / ladehub — visuell inspeksjon + funksjonstest 365 dager
- Dock (DJI Dock 2/3) — 180 dager, merket som foreløpig anbefaling

Fra nettresearch legges det også inn to generiske, leverandøruavhengige oppføringer for ikke-DJI-flåte: "Ikke-DJI multirotor — lett ettersyn (100 t / 180 dager)" og "Ikke-DJI multirotor — hovedettersyn (200 t / 365 dager)", tydelig merket som defaults som må bekreftes mot produsentens manual.

## Om antall oppdrag

Ingen produsent bruker oppdrag som terskel — DJI teller timer, dager og batterisykluser. Anbefalingen er derfor: **la `interval_missions` stå tomt i katalogen**, slik at ingen får feilaktig inntrykk av at det er et produsentkrav. Oppdragsintervall beholdes som en frivillig kolonne den enkelte kan fylle inn selv (nyttig internt, f.eks. "inspiser fallskjermfeste hvert 25. oppdrag"). Unntaket vi legger inn er én ren intern mal: "Fallskjerm — festeinspeksjon hvert 25. oppdrag", tydelig merket som intern anbefaling, ikke leverandørkrav.

## Teknisk

Migrasjon på `maintenance_schedule_presets`:

- `company_id` gjøres nullable; ny kolonne `is_global boolean not null default false`, pluss `kategori text`, `modellfamilie text`, `kilde_url text`, `merknad text`, `sist_verifisert date`.
- CHECK-trigger (ikke CHECK-constraint): global mal krever `company_id is null`, selskapsmal krever `company_id not null`.
- RLS: SELECT-policy utvides med `or is_global`. INSERT/UPDATE/DELETE beholdes uendret på selskapsmaler, og blokkeres eksplisitt for `is_global` (kun `service_role`/superadmin kan endre katalogen). GRANTs beholdes som i dag (`authenticated`, `service_role`).
- Seed-INSERT av katalogradene over i samme migrasjon, idempotent på `navn` der `is_global`.

Kode:

- `src/lib/maintenanceSchedules.ts`: `fetchSchedulePresets` henter `.or(company_id.eq.<id>,is_global.eq.true)` og returnerer nye felter i `MaintenanceSchedulePreset`.
- `src/components/resources/MaintenanceSchedulesSection.tsx`: grupperer nedtrekket i katalog/egne, viser merknad + kildelenke for katalogmaler, og skjuler slett/rediger for globale.
- Alle nye tekster via `t()` med nøkler i både `no.json` og `en.json`. Katalognavn og merknader lagres på norsk i databasen (som øvrige maler i dag).
