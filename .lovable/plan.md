## Mål
Sikre at AI-analysen på `/status` og `/statistikk`:
1. Ikke mottar personidentifiserbar informasjon (navn, e-post).
2. Får eksplisitte antall droner, utstyr og piloter slik at den vurderer skala riktig.
3. Svarer vennlig men med klare, prioriterte anbefalinger.
4. Gir tilnærmet identisk svar på samme datagrunnlag (konsekvent).

## Endringer

### 1. `src/pages/Status.tsx` – `runAiAnalysis` payload
- Fjerne `companyName` (erstattes av nøytral `companyLabel: "Selskap"` eller helt utelates – AI-en trenger ikke navnet).
- Legge til eksplisitt `resourceCounts`:
  - `drones`: { total, grønn, gul, rød }
  - `equipment`: { total, grønn, gul, rød }
  - `personnel`: { total, grønn, gul, rød }
  - Hentes fra `useStatusData()` (drones, equipment, personnel + status-tellinger).
- Sanity-sjekke at `flightHoursByDrone` bruker drone-modell/serienr (ikke personnavn) – beholdes som er.
- Beholde aggregerte tall for hendelser/avvik (ingen fritekst, ingen rapportør-navn).
- Sende `periodLabel` som før.

### 2. `src/pages/Statistikk.tsx` – plattformkall
- Bytte payload til `{ exclude_avisafe, anonymize_companies: true }` slik at edge-funksjonen erstatter selskapsnavn i `rankings/topCompanies` med `"Selskap A"`, `"Selskap B"` … (stabil rekkefølge basert på id-hash) før det sendes til AI.

### 3. `supabase/functions/company-status-ai/index.ts`
- Validere/strippe payload: kaste bort eventuelle felter som matcher PII-mønster (`full_name`, `email`, `reporter`, `created_by_name`, `name` på personell). Whitelist heller enn blacklist: bygge nytt objekt fra kjente, sikre nøkler før sending til AI.
- Oppdatert systemprompt (norsk):
  - Vennlig, støttende tone (“Hei leder, …”), men direkte og konkret.
  - Eksplisitt instruks: vekt vurderingen etter flåtestørrelse (`resourceCounts`). F.eks. 5 hendelser på 2 droner er kritisk; 5 hendelser på 40 droner er moderat. Bruk rater per drone/pilot/oppdrag der det gir mening.
  - Aldri nevne personnavn eller spekulere om enkeltpersoner.
  - Fast struktur (eksakt overskrifter og rekkefølge):
    1. **Sammendrag**
    2. **Nøkkeltall (flåte og aktivitet)** – speile `resourceCounts` + oppdrag/flytimer.
    3. **Trender** – kulepunkter med ↑/↓ og prosent når mulig.
    4. **Risikoområder** – rangert etter alvorlighet, alltid normalisert mot flåtestørrelse.
    5. **Anbefalt fokus** – opplæring, kurs, sjekklister, prosesser, utstyr.
    6. **Konkrete tiltak** – nummerert, hvert tiltak merket `[Høy]` / `[Medium]` / `[Lav]`.
  - Maks ~450 ord. Hvis datagrunnlaget er tynt: si det først, foreslå hvilke data som bør samles inn.
- AI-kallparametre for konsekvens:
  - `temperature: 0`
  - `top_p: 0.1`
  - `seed: 42`
  - Beholde streaming.

### 4. `supabase/functions/platform-statistics-ai/index.ts`
- Samme PII-whitelist på `dataContext` (i praksis allerede aggregert, men eksplisitt fjerne evt. selskapsnavn fra `rankings` og erstatte med `Selskap 1..N` når `anonymize_companies` er satt).
- Legge til samme `resourceCounts`-blokk hentet via `admin` (sum droner, utstyr, profiler med approved=true, gruppert grovt) – slik at modellen kan normalisere mot total flåtestørrelse på plattformen.
- Samme systemprompt-struktur og generation-parametre som over (temperature 0, top_p 0.1, seed 42, samme overskrifter, vennlig tone).

### 5. Klientvisning
- Ingen endring i visning (Collapsible + markdown-stripping er allerede på plass). Knappen for «Generer på nytt» beholdes; siden output nå er deterministisk vil det normalt gi tilnærmet samme svar.

## Tekniske detaljer
- Ingen DB-migrasjoner, ingen nye secrets.
- PII-whitelist implementeres som en `sanitizePayload(input)` helper i hver edge-funksjon (rekursivt fjerner nøkler i `BLOCKED = ['full_name','email','reporter','created_by_name','opprettet_av','user_name','person_name','navn_kontaktperson']`).
- `resourceCounts` på `/status` bygges i `Status.tsx` ut fra eksisterende `droneStatus`, `equipmentStatus`, `personnelStatus` fra `useStatusData` (legges til i destrukturering hvis den ikke allerede er der).
- `seed` støttes av Gemini via AI Gateway; hvis modellen ignorerer det, sikrer `temperature: 0` + `top_p: 0.1` likevel høy konsekvens.

## Verifisering
- Kjør AI-analyse på `/status` to ganger på rad uten dataendring → svarene skal være nær identiske.
- Inspisér edge-function-loggen og bekreft at payload-stringen ikke inneholder navn/e-post.
- Sjekk at rapporten omtaler flåtestørrelse (antall droner/utstyr/piloter) og normaliserer hendelser/avvik mot disse.
- Test på liten flåte (få ressurser) og stor flåte (mange ressurser) – anbefalinger skal være ulike i alvorlighet.
