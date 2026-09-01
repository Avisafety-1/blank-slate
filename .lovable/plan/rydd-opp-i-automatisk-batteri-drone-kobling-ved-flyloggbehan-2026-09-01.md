# Rydd opp i automatisk batteri↔drone-kobling ved flyloggbehandling

## Hva som faktisk skjer i dag (bekreftet)

Ved import av DJI-logg i opplastingsdialogen er avkrysningsboksen "Knytt batteri til dronen" **på som standard**. Hver gang en logg behandles:

1. Batteriet får en permanent kobling til den valgte dronen (`drone_equipment`).
2. Det skrives en historikkoppføring "Lagt til" i loggboken — men bare hvis siste hendelse for *akkurat den dronen* ikke allerede var "Lagt til".

For batteri `9DFPN97CA076CZ` viser dataene mønsteret tydelig: batteriet ble koblet til to forskjellige droner (begge heter "DJI Mini 5") av Dronepilot ELVIS gjennom loggimport, Martin fjernet begge koblingene manuelt 22.08, og neste import la det inn igjen. Det er derfor loggboken ser ut som at batteriet "bytter drone" hver gang noen behandler en fil.

Manuelt fjernede koblinger blir altså overstyrt av neste import, og batterier som brukes på flere droner samler opp koblinger på alle sammen.

## Hva som gjøres

1. **Ikke lenger permanent kobling som standard**
   - Avkrysningsboksen "Knytt batteri til dronen" settes til av som standard. Den som vil ha en permanent kobling på dronekortet, huker den av bevisst.

2. **Respekter manuell fjerning**
   - Før import oppretter en kobling, sjekkes historikken: hvis siste hendelse for dette batteriet og denne dronen er "Fjernet", gjenopprettes ikke koblingen automatisk (avkrysningsboksen kan fortsatt overstyre manuelt i dialogen).

3. **Mindre støy i loggboken**
   - Det skrives kun "Lagt til"-oppføring når en kobling faktisk blir opprettet (dvs. når brukeren har valgt permanent kobling), ikke ved hver loggbehandling.
   - Selve flyturen logges som før i både batteri- og droneloggbok, så sporbarheten over hvilket batteri som fløy med hvilken drone er uendret.

4. **Tydeligere tekst i loggbokoppføringen**
   - Der to droner har samme modellnavn ("DJI Mini 5") vises også dronens navn/serienummer, slik at det går an å se hvilken drone det gjelder.

## Teknisk

- Endringer kun i `src/components/UploadDroneLogDialog.tsx` (standardverdi for `linkBatteryToDrone`, og `ensureDroneEquipmentHistory` som får sjekk mot siste "removed" og skriver historikk kun ved faktisk kobling).
- Visningstekst i `src/components/resources/EquipmentLogbookDialog.tsx`.
- Ingen databaseendringer, ingen RLS/grants, ingen sletting av eksisterende koblinger eller historikk. Eksisterende "Lagt til"/"Fjernet"-oppføringer blir stående som revisjonsspor.
- Nye/endrede tekster legges i både `no.json` og `en.json`.

## Åpent valg

Skal eksisterende overflødige koblinger i `drone_equipment` ryddes (f.eks. for Elverum), eller lar vi dem stå og lar brukerne fjerne dem manuelt? Standard i planen er å la dem stå.
