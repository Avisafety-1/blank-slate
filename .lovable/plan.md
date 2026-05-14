## Mål

Popup for planlagte oppdrag på kartet skal også vise:
- **Selskapsnavn** (offentlig navn fra rot-selskapet, deles av alle avdelinger)
- **Oppdragstype** (valgt fra liste, eller fritekst hvis "Annet")

Skjules ved anonym publisering.

## Endringer

### 1. Database

**`companies`** – nytt felt:
- `public_company_name TEXT` (valgfritt). Vises offentlig på kartet. Hvis tomt, faller tilbake til `navn`.

**`missions`** – nye felt:
- `oppdragstype TEXT` (en av: Inspeksjon, Kartlegging, Foto/film, Søk og redning, Landbruk, Bygg/anlegg, Forskning, Annet)
- `oppdragstype_annet TEXT` (fritekst, kun brukt når `oppdragstype = 'Annet'`)

**`mission_map_publications`** – nye snapshot-felt:
- `public_company_name TEXT`
- `public_mission_type TEXT` (ferdig sammensatt streng – enten valg, eller fritekst hvis "Annet")

**Trigger `sync_mission_map_publication`** oppdateres til å:
- Slå opp **rot-selskapets** `public_company_name` via eksisterende `get_parent_company_id` (rekursivt til toppen). Faller tilbake til `navn`.
- Snapshotte `oppdragstype` (med `oppdragstype_annet` hvis "Annet").
- Sette begge til `NULL` når `v_anon = true`.

### 2. Frontend

**Mitt selskap (admin)**
- Nytt input i selskapsinnstillinger: "Offentlig selskapsnavn" med hjelpetekst om at det vises på offentlig kart og deles av alle avdelinger.
- Kun synlig/redigerbart for rot-selskap (eller readonly med visning av arvet verdi for avdelinger).

**Oppdrag-skjema (opprett/rediger)**
- Ny dropdown "Oppdragstype" med ovennevnte alternativer.
- Hvis "Annet" velges → vises fritekstfelt "Spesifiser oppdragstype".

**Kart-popup (`src/lib/mapDataFetchers.ts`)**
- Bruk nye felt fra `v_planned_mission_map`:
  - Vis `public_company_name` som egen linje øverst (under tittel) når satt.
  - Vis `public_mission_type` som chip/badge under tittel.
- Tidsperiode vises fortsatt som "start – (ukjent sluttid)".

### 3. View

`v_planned_mission_map` utvides med `public_company_name` og `public_mission_type`.

## Tekniske detaljer

- Rekursiv parent-lookup gjøres i trigger via `WITH RECURSIVE` (eller løkke) som klatrer `parent_company_id` til toppen og henter dennes `public_company_name`.
- Eksisterende rader i `mission_map_publications` får verdiene fylt inn ved at vi kjører en engangs-UPDATE etter migrasjonen som re-syncer fra missions/companies.
- Ingen RLS-endringer (popup-data er allerede offentlig via publisering).
- Ingen endring i anonym-logikk utover at de to nye feltene også settes til NULL.

## Verifikasjon

1. Sett "Offentlig selskapsnavn" på rot-selskap, opprett oppdrag i underavdeling med oppdragstype "Inspeksjon" → popup viser rot-selskapets navn + "Inspeksjon".
2. Velg "Annet" + skriv "Termografering" → popup viser "Termografering".
3. Aktiver anonym publisering → selskapsnavn og oppdragstype skjules.