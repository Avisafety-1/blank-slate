

## Tydeliggjøring av «Kvitter ut advarsel»-knappen

### Problem

«Kvitter ut advarsel»-knappen på drone- og utstyrskort er forvirrende:
- Ingen forklaring på **hva** advarselen gjelder (f.eks. «lav batterihelse fra flylogg»)
- Hvis gul/rød status er drevet av **vedlikehold** (dato/timer/oppdrag), hjelper det ikke å kvittere ut — statusen forblir gul/rød
- Brukeren forventer at knappen gjør noe med den synlige statusen, men den endrer kun DB-flagget fra importerte advarsler

### Løsning

**1. Vis kun knappen når DB-statusen faktisk påvirker den synlige statusen**

Beregn vedlikeholdsstatus separat. Vis «kvitter ut»-knappen **kun** når:
- `drone.status` (DB) er Gul/Rød (fra importerte advarsler), **OG**
- Vedlikeholdsstatus alene er bedre enn DB-status (dvs. kvittering vil faktisk endre synlig status)

Hvis vedlikehold allerede gir Gul/Rød uavhengig av DB-flagget → skjul knappen, vis i stedet en tekst som forklarer at status er drevet av vedlikehold.

**2. Vis årsaken til advarselen**

Hent siste loggbokinnlegg med `entry_type = 'Advarsel'` for dronen/utstyret og vis tittelen i dialogen: «Advarsel: Lav batterihelse registrert — vil du kvittere ut?»

**3. Vis tydelig statusforklaring**

Under status-badgen, vis en kort forklaring:
- «⚠️ Advarsel fra flylogg» — når DB-status driver
- «🔧 Vedlikehold påkrevd» — når vedlikehold driver
- Begge hvis begge gjelder

### Filer som endres

**`src/components/resources/DroneDetailDialog.tsx`**
- Beregn `maintenanceOnlyStatus` (uten DB-status) — dette finnes allerede som `maintenanceAggregated`
- Vis «Kvitter ut»-knappen kun hvis `drone.status !== 'Grønn'` OG `STATUS_PRIORITY[drone.status] > STATUS_PRIORITY[maintenanceAggregated]` (dvs. DB-advarselen gjør faktisk statusen verre)
- Alternativt: vis alltid knappen men med forklarende tekst om at vedlikehold også påvirker
- Hent siste advarsel fra `drone_log_entries` med `entry_type = 'Advarsel'` for å vise i bekreftelses-dialogen
- Legg til forklarende tekst under status-badge

**`src/components/resources/EquipmentDetailDialog.tsx`**
- Samme logikk: beregn vedlikeholdsstatus separat, vis knapp kun når DB-advarsel driver statusen
- Hent siste advarsel fra `equipment_log_entries`
- Forklarende tekst under status

### Eksempel på ny UX

```text
Status: 🟡 Gul
  🔧 Vedlikehold nærmer seg (14 dager)
  [ingen kvitter-knapp — vedlikehold løses ved å utføre vedlikehold]

Status: 🟡 Gul  
  ⚠️ Advarsel: Lav batterihelse (fra flylogg 12.03.2026)
  [Kvitter ut advarsel]

Status: 🔴 Rød
  🔧 Vedlikehold forfalt
  ⚠️ Advarsel: Hø