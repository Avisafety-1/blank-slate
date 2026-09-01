# Batterier uten data hos Elverum (DJI Mini 5)

## Hva som faktisk er galt (bekreftet i data og kode)

Batteri `9DFPN8VCA07AFG` har fire importerte DJI-flylogger hos Elverum. Alle fire har full kapasitet (2803–2833 mAh), men `battery_cycles` er tom i alle. Batteritrend-fanen henter kun logger der syklustall finnes (`.not("battery_cycles","is",null)` i `useBatteryHealth`), så fanen viser "Ingen batterihistorikk funnet" selv om det finnes kapasitet-, spennings- og temperaturdata.

Tellingen for hele Elverum: 216 flylogger med batteriserienummer, kun 56 har syklustall, 151 har kapasitet, 158 har spenning/temperatur, og **0** har `drone_model`.

To konkrete årsaker:

1. Ved batch-import skrives `battery_cycles: parsed.batteryCycles || null` — et helt nytt batteri med **0 sykluser** blir da lagret som "ingen data" i stedet for 0. Mini 5-batteriene hos Elverum er nye (0–3 sykluser).
2. `drone_model` lagres som `parsed.droneType`, og DJI-loggene for Mini 5 gir tomt `DETAILS.droneType`. Uten modellnavn faller auto-matching mot batterikatalogen tilbake på kapasitet/spenning alene.

## Hva som fikses

1. **Ikke kast bort 0-verdier ved import**
   - `battery_cycles` (og tilsvarende felt for batteri 2) lagres med eksplisitt null-sjekk i stedet for `|| null`, slik at 0 sykluser lagres som 0.

2. **Batteritrend skal vise data selv uten syklustall**
   - Fjern kravet om syklustall i uthentingen; ta med logger som har kapasitet, spenning, temperatur eller celleavvik.
   - Rader uten syklustall vises i trenden med tom syklus-kolonne, ikke skjules.

3. **Fyll inn dronemodell når loggen mangler den**
   - Når `DETAILS.droneType` er tom, brukes modellen fra dronen loggen ble matchet til (eller dronenavnet fra loggen) som `drone_model`.
   - Det gir riktig katalog-matching (Mini 5-typen som nå ligger i katalogen) i stedet for ren kapasitetsgjetting.

4. **Etterfyll eksisterende Elverum-logger (valgfritt steg)**
   - Sette `drone_model` på allerede importerte logger der loggen er koblet til en drone med kjent modell. Ingen flydata, kapasitet eller helseverdier endres.

## Teknisk

- `src/components/upload/BatchLogPanel.tsx`: null-sikker skriving av syklusfelt, `drone_model`-fallback fra matchet drone.
- `src/hooks/useBatteryHealth.ts`: løsne filteret på `battery_cycles`, håndtere manglende sykluser i graf/tabell.
- `supabase/functions/process-dronelog/index.ts`: returner `droneType` fra `DETAILS.aircraftName`/matchet drone når `DETAILS.droneType` er tom.
- Punkt 4 er én dataoppdatering (kun `drone_model`), ingen skjemaendring, ingen endring i RLS eller tilganger.
