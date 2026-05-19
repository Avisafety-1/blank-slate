# Fiks Kp-indeks fra NOAA — alltid 0

## Hva er feil

NOAA-endepunktet `https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json` returnerer en **liste med objekter**:

```json
[
  {"time_tag":"2026-05-12T00:00:00","kp":0.67,"observed":"observed","noaa_scale":null},
  {"time_tag":"2026-05-12T03:00:00","kp":1.00,"observed":"observed","noaa_scale":null},
  ...
]
```

Men `supabase/functions/ai-risk-assessment/index.ts` (linje 858–918) leser den som **liste med arrays** (gammelt CSV-lignende format):

```ts
const kpRaw: string[][] = await kpRes.json();
// ...
for (let i = 1; i < kpRaw.length; i++) {   // hopper over første rad (var "header")
  const row = kpRaw[i];
  const rowDate = (row[0] || '').substring(0, 10);  // row[0] er undefined
  const kpVal = parseFloat(row[1]);                  // NaN
  ...
}
```

Resultat: `row[0]`/`row[1]` finnes ikke på objekter, `kpVal` blir `NaN`, `maxKp` forblir `0`. Derfor viser AI-risikovurderingen så å si alltid **Kp = 0 (G0, rolig)** — uavhengig av faktisk geomagnetisk aktivitet.

## Endring

I `supabase/functions/ai-risk-assessment/index.ts`, blokken som henter Kp:

1. Type kpRaw som `Array<{ time_tag: string; kp: number; observed?: string; noaa_scale?: string | null }>`.
2. Start løkken på `i = 0` (ingen header-rad lenger).
3. Les `row.time_tag.substring(0, 10)` (ISO `YYYY-MM-DDTHH:...`, så `substring(0,10)` gir riktig dato).
4. Les `row.kp` direkte (allerede number).
5. Behold logikken for `missionDateStr`, fallback til neste dag, avrunding, og G-skala-mapping.
6. Legg til defensiv sjekk: hvis responsen ikke er en array, eller første element ikke har `kp`-feltet, logg advarsel og behold `kpIndex: null` (slik at prompten sier "ikke tilgjengelig" i stedet for å bløffe Kp 0).
7. Logg `kpRaw.length` og høyeste Kp funnet, så vi kan verifisere i edge function-loggene.

Ingen andre filer endres. Prompten håndterer allerede `kpIndex === null` korrekt.

## Verifisering

- Deploy `ai-risk-assessment` på nytt.
- Kjør en risikovurdering på et oppdrag i dag.
- Sjekk edge function-loggene for `Solar activity: Kp=...` med en realistisk verdi (typisk 1–3 på rolige dager).
- Sjekk "Vær"-seksjonen i rapporten — Kp-linjen skal nå reflektere faktisk verdi.
