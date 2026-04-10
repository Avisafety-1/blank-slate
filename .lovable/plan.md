
Jeg kan ikke se råresponsen direkte akkurat nå med dagens verktøy fordi:

- `flighthub2-proxy` krever auth, og direkte kall fra testverktøyet returnerer `401 Unauthorized`
- eksisterende edge-logs viser bare `test-connection` / prosjektkall, ikke råresponsen fra `list-devices`
- UI-et viser kun “Ingen enheter funnet”, men eksponerer ikke `data`, `diagnostics` eller rå `orgText`

Plan for å få ut rå-data på en trygg og rask måte:

1. Oppdatere `flighthub2-proxy`
- I `list-devices` lagre og returnere ekstra debugfelt midlertidig:
  - `raw_status`
  - `raw_code`
  - `raw_message`
  - `raw_body_preview` (første del av DJI-responsen)
  - `raw_list_sample` (første 1–3 elementer fra `data.list`)
  - `raw_shape` (om elementene er `{ gateway, drone }`, flate objekter, eller noe annet)
- Beholde normalisering som i dag, men gjøre det tydelig hva som faktisk kom fra DJI før filtrering.

2. Oppdatere `FH2DevicesSection.tsx`
- Legge inn en liten debugvisning under “Hent enheter”:
  - “Vis rå-data”
  - viser `diagnostics`
  - viser `raw_body_preview`
  - viser første element(er) av responsen formatert i `<pre>`
- Hvis listen blir tom, vise hvorfor:
  - “DJI returnerte 0 enheter”
  - eller “DJI returnerte enheter, men de ble ikke mappet riktig”

3. Gjøre parsingen enda mer robust
- Siden DJI-dokumentasjonen viser `list[] -> { gateway, drone }`, støtte eksplisitt:
  - kun `gateway`
  - kun `drone`
  - begge
  - allerede flate objekter
- Ikke filtrere bort poster før vi har logget hva som faktisk mangler (`sn`, `callsign`, `device_model`, osv.)

4. Verifisering
- Åpne admin > Tensio > FH2
- Klikke “Hent enheter”
- Bekrefte at råresponsen vises i UI
- Sammenligne rå-data med normalisert liste
- Deretter rette siste mapping hvis DJI returnerer en litt annen struktur enn dokumentasjonen

Forventet resultat
- Vi får se nøyaktig hva `/openapi/v0.1/device` returnerer for Tensio
- Vi kan fastslå om problemet er:
  - tom respons fra DJI
  - feil respons-shape
  - feil mapping i edge-funksjonen
  - filtrering i UI-et

Teknisk berørte filer
- `supabase/functions/flighthub2-proxy/index.ts`
- `src/components/admin/FH2DevicesSection.tsx`
