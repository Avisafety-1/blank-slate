# Batterihelse: katalog med batterityper + gruppevis oppsett

## Hva DJI-loggen faktisk gir oss

Verifisert mot databasen (1421 flylogger):

- `battery_health_pct` finnes kun i 29 logger — DJI-feltet `BATTERY.status.RAW` er tomt/0 for de fleste droner. Derfor viser "Helse" i dag `—%` eller `0%`.
- `battery_cycles` finnes i 405 logger, `battery_full_capacity_mah` i 464, og `battery_voltage_min_v` alltid.
- Loggen sier **ikke** direkte hvilken dronetype batteriet hører til. Men den gir to sterke signaler:
  - **Full kapasitet (mAh)** — f.eks. ~2800 mAh (Mavic 3-klasse), ~4500–4700 mAh (M30/M300-klasse), ~5000 mAh (FlyCart-klasse).
  - **Spenning** — ~7 V (2S), ~15 V (4S), ~43 V (12S) → avslører celletall og dermed batteriserie.
  - I tillegg vet vi hvilken **drone** loggen tilhører (`flight_logs.drone_id`), så dronemodellen kan foreslå batteritype.

Konklusjon: helse kan regnes ut pålitelig som `full kapasitet / designkapasitet`, men det krever at vi vet designkapasiteten — altså en katalog over batterityper.

## Løsningen

### 1. Katalog over batterityper (ny tabell `battery_types`)

Globale, ferdigutfylte oppføringer (synlige for alle) + mulighet for at et selskap legger til egne. Felter per type:

- Navn (f.eks. "DJI TB30 (M30-serien)"), produsent, dronemodeller den passer til
- Designkapasitet (mAh), celletall (S), nominell spenning
- Maks anbefalte sykluser (f.eks. 200 / 400)
- Terskler: helse gul/rød (f.eks. <80 % / <60 %), celleavvik gul/rød (f.eks. 0,05 V / 0,10 V), maks temp
- Auto-gjenkjenning: forventet kapasitetsområde + spenningsområde

Seed-katalog med de vanligste DJI-batteriene (Mavic 3/3T, Mavic 4, Air-serien, Mini, TB30/M30, TB65/M350, M400, FlyCart 30/100) — verdiene hentes fra DJI-spesifikasjoner og markeres som redigerbare, slik at dere kan justere.

### 2. Kobling batteri → batteritype

- Ny kolonne `equipment.battery_type_id`.
- **Auto-forslag**: når en flylogg importeres, matcher vi målt kapasitet + spenning (og dronemodellen på loggen) mot katalogen og foreslår type. Treffer det entydig, settes typen automatisk.
- **Manuell overstyring** alltid mulig.

### 3. Gruppevis oppsett (det du etterspurte)

Ny dialog "Batterityper" under Ressurser:

- Liste over katalogtyper med parametre, redigerbare per selskap.
- Knappen "Tildel batterier" → flervalgsliste over alle batterier (med filtrering og "velg alle uten type"), setter type på hele gruppa i én operasjon.
- Egen knapp for å kjøre auto-match på eksisterende batterier og forhåndsvise resultatet før man lagrer.

### 4. Faktisk helseutregning

Helse regnes ut på nytt i stedet for å stole på DJI-feltet:

```text
kapasitetshelse = full_kapasitet_mAh / designkapasitet_mAh * 100
sykluslevetid   = (1 - sykluser / maks_sykluser) * 100
helse           = min(kapasitetshelse, sykluslevetid)
```

- Har vi kun sykluser (ingen kapasitet), brukes syklusdelen alene, og omvendt.
- DJI sin `battery_health_pct` brukes bare hvis den er > 0 og vi mangler alt annet.
- Celleavvik vurderes separat mot terskler fra typen (i dag hardkodet 0,1 V for alle batterier).
- Mangler batteriet en type, viser vi "Helse ukjent — velg batteritype" med snarvei til dialogen, i stedet for `—%`.

### 5. Hvor det vises

- Batteritrend-fanen i loggboken: helse-kort, historikktabell og farger bruker den nye utregningen og terskler fra typen.
- Utstyrsdetaljer: helse-baren og sykluser fargelegges mot typens maks sykluser, ikke faste 200/300.
- Utstyrslisten: gult/rødt merke når helse eller syklusandel er under terskel.

## Teknisk

- Migrasjon: `battery_types` (globale rader `company_id IS NULL` + selskapsegne), GRANTs, RLS (les globale + egne, skriv kun egne som admin), `equipment.battery_type_id` FK med `ON DELETE SET NULL`, seed-data for DJI-batterier.
- Ny delt hjelpefil `src/lib/batteryHealth.ts` med utregning + auto-match, brukt av loggbok, detaljdialog og importflyt (`UploadDroneLogDialog`, `BatchLogPanel`).
- Ny `src/components/resources/BatteryTypesDialog.tsx` (katalog + gruppetildeling).
- Alle nye tekster i både `no.json` og `en.json`.

## Bekreft før bygging

- Skal katalogen være global for alle AviSafe-kunder (redigerbar kun av superadmin) og at hvert selskap kan legge til egne typer? Det er forslaget over.
