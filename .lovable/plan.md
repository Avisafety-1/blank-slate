# Egendefinerte batterityper i batterihelse-dialogen

## Hva som er situasjonen i dag

- Dialogen skriver kun overstyringer til `equipment`-raden (`battery_design_capacity_mah`, `battery_max_cycles`, terskler). Den oppretter aldri rader i `battery_types`.
- Velger du "Ingen batteritype", lagres `battery_type_id = null` og `battery_type_locked = false`. Neste gang loggboken laster, kjører automatikken (`persistAutoMatch`) og setter en katalogtype igjen, fordi raden er ulåst og uten type. Valget "ingen" holder altså ikke.
- Tabellen `battery_types` har allerede RLS som tillater at en admin/superadmin oppretter, endrer og sletter selskapsegne typer (`company_id` satt), og alle i selskapshierarkiet kan lese dem (`get_user_visible_company_ids`). Ingen databaseendring trengs.

## Det som skal bygges

### 1. Opprett egen batteritype i dialogen

Ny knapp "Ny batteritype" ved siden av nedtrekkslisten. Åpner et lite skjema i samme dialog med:

- Navn (påkrevd), produsent (valgfritt), dronemodeller (kommaseparert, brukes til automatisk gjenkjenning)
- Designkapasitet (mAh), celletall, maks sykluser
- Terskler: helse gul/rød, celleavvik gul/rød

Lagres til `battery_types` med `company_id` = brukerens selskap, slik at typen kun er synlig for selskapet og dets avdelinger. Etter lagring velges den nye typen automatisk for batteriet, og listen oppdateres.

Nedtrekkslisten grupperes i "Katalog (globale)" og "Egne batterityper", slik at det er tydelig hva som er selskapets egne.

### 2. Rediger/slett egne typer

Blyantikon ved siden av nedtrekkslisten når en selskapsegen type er valgt: åpner samme skjema forhåndsutfylt, med sletteknapp. Globale katalogtyper er ikke redigerbare (kun leses) for vanlige selskaper — der brukes overstyringene per batteri som før. Kun brukere med admin/superadmin kan opprette/endre/slette (samsvarer med RLS); for andre skjules knappene.

### 3. "Ingen batteritype" skal respekteres

- Når man lagrer med "Ingen batteritype" valgt, settes `battery_type_locked = true` sammen med `battery_type_id = null`, slik at automatikken ikke overskriver valget.
- Automatikken (`persistAutoMatch`) endres tilsvarende: den setter kun type når raden er ulåst.
- Da vil manuelle verdier (f.eks. 2000 sykluser) uten batteritype faktisk slå gjennom på KPI-en, som forventet.

### 4. Tydeligere tilbakemelding

- Under parametrene vises et lite forhåndsvisningsfelt: "Helse med disse verdiene: X %" (finnes delvis i dag inne i forklaringsfeltet — flyttes ut så den alltid er synlig).
- Etter lagring lastes loggbok-KPI-en på nytt (`reload()` finnes allerede i `useBatteryHealth`).

## Teknisk

- `src/components/resources/BatteryHealthSettingsDialog.tsx`: skjema for opprett/rediger type, gruppering i Select, låselogikk ved "ingen type", forhåndsvisning.
- `src/lib/batteryHealth.ts`: `createBatteryType`, `updateBatteryType`, `deleteBatteryType`; `persistAutoMatch` respekterer `battery_type_locked`.
- Rollesjekk via eksisterende `useRoleCheck`.
- Ingen migrasjon: `battery_types` med GRANTs og RLS finnes allerede og dekker selskapsegne rader.
- Alle nye tekster legges i både `no.json` og `en.json`.
