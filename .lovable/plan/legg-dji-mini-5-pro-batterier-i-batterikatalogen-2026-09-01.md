# Legg DJI Mini 5 Pro-batterier i batterikatalogen

## Problemet (bekreftet i data)

Hos Elverum Videregående Skole rapporterer Mini 5-batteriene ca. **2761–2839 mAh** full kapasitet (nye pakker, 0–3 sykluser). Katalogtypen `DJI Mini 3 / 4 batteri` har `DJI Mini 5` liggende i sin modelliste og en designkapasitet på **2453 mAh**, med kapasitetsvindu 2000–3000 mAh. Det gir helse på ca. **115 %** for helt nye batterier. Flere Elverum-batterier er allerede auto-matchet til denne typen.

## Hva som gjøres

1. **Ny global katalogtype: "DJI Mini 5 Pro batteri"**
   - Modeller: `DJI Mini 5 Pro`, `DJI Mini 5`
   - Designkapasitet: 2788 mAh (offisiell standardpakke), 2 celler, 7,6 V nominelt
   - Kapasitetsvindu: 2600–3000 mAh, spenningsvindu 6,5–8,8 V, maks sykluser 200

2. **Ny global katalogtype: "DJI Mini 5 Pro batteri Plus"**
   - Samme modeller, designkapasitet 3500 mAh, kapasitetsvindu 3100–3900 mAh
   - Dekker den observerte 3522 mAh-pakken

3. **Rydd i "DJI Mini 3 / 4 batteri"**
   - Fjern `DJI Mini 5` fra modellisten
   - Snevre kapasitetsvinduet til 2000–2600 mAh, slik at Mini 5-pakker ikke lenger treffer feil type

4. **Re-match berørte batterier**
   - Nullstill `battery_type_id` kun for utstyr som i dag peker på Mini 3/4-typen, har full kapasitet over 2600 mAh og **ikke** er manuelt låst (`battery_type_locked = false`). Auto-matchingen setter da riktig Mini 5-type ved neste lasting.
   - Manuelt valgte/låste typer og alle manuelle overstyringer røres ikke.

## Teknisk

- Én migrasjon (kataloginnhold i `battery_types` + målrettet oppdatering av `equipment.battery_type_id`). Ingen endring i tabellstruktur, RLS eller grants.
- Ingen kodeendring nødvendig: `autoMatchBatteryType` i `src/lib/batteryHealth.ts` bruker modellnavn først, deretter kapasitet/spenning, så de nye vinduene løser konflikten mellom standard- og Plus-pakke.
- Ingen flylogger, loggbokoppføringer eller helsehistorikk endres; helseverdier regnes ut i frontend fra kapasitet + katalogverdier.

## Åpen detalj

Hvis dere har DJI sitt oppgitte tall for Mini 5 Pro-pakkene (mAh/Wh på etiketten), bruker jeg det i stedet for 2788/3500 — si fra så justerer jeg før migrasjonen kjøres.
