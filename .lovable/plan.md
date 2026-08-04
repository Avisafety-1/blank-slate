# Hvorfor Sverre ikke vises som "koblet til dronen"

## Årsaken (bekreftet i databasen)

To droner i selskapet har **samme serienummer** `1581F9DEC2584029`:

| Drone | Tilknyttet personell |
|---|---|
| DJI Mini 5 Sverre | Sverre Rasmussen |
| DJI Mini 5 Martin Madsbu | (ingen) |

Ved opplasting matches dronen på serienummer, og første treff i listen velges — her ble
"DJI Mini 5 Martin Madsbu" valgt (synlig i oppsummeringen i skjermbildet: "DJI Mini 5 Martin
Madsbu +15 min flytid"). Den dronen har ingen tilknyttet personell, derfor blir ingen i
pilotlisten uthevet. Uthevingen fungerer altså som den skal — den peker bare på feil drone.

## Forslag til løsning

1. **Rydd i data (viktigst):** ett serienummer skal kun ligge på én drone. Enten fjernes/rettes
   serienummeret på "DJI Mini 5 Martin Madsbu", eller den slettes hvis den er en duplikat-
   oppføring. Dette gjøres i drone-kortet — jeg kan også gjøre det for deg hvis du sier hvilken
   som er riktig.

2. **Gjør automatikken robust ved duplikater (kodeendring):**
   - I `matchDroneFromResult` i `src/components/UploadDroneLogDialog.tsx`: samle *alle* droner
     som matcher serienummeret i stedet for bare første treff.
   - Ved flere treff: prioriter dronen som har innlogget bruker i `drone_personnel`, deretter
     dronen med sist flydd-dato. Vis en tydelig varsel-boks ("Flere droner har dette
     serienummeret — kontroller at riktig er valgt") med lenke til drone-velgeren.
   - Ved ett treff: uendret oppførsel.

3. **Uthevingsfarge:** dagens utheving er lysegrønn (`emerald`). Skal den byttes til gul, endres
   klassene i pilot-listen i samme fil.

## Teknisk

- Berørt fil: `src/components/UploadDroneLogDialog.tsx` (linje ~686 matchlogikk, ~2366 pilotliste).
- Ingen databaseendringer eller migrasjoner nødvendig for kodedelen.
- Nye i18n-nøkler for duplikat-varselet legges i både `no.json` og `en.json`.
