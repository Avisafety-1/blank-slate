# Rydd resten av de skjulte sjekklistene i Tensio

## Hva gjennomgangen viser

Jeg har sjekket alle aktive droner i hele systemet mot hvilke sjekklister de faktisk har tilgang til. Alle treff ligger i Tensio-hierarkiet, og de deler seg i to typer:

**1. Sjekklister som er slettet, men fortsatt koblet til dronen**
- «Nødsjekklister» (tidligere eid av Tensio Nord) er slettet, men henger fortsatt på **11 droner i Tensio Nord** (LN.0510.AA, AB, AD, AJ, AK, AM, AO, BA, BY, CU, CV) og **2 droner i Tensio Sør** (LN.0510.AF og Mavic 3 Thermal …0FN).
- Ett ekstra slettet dokument henger på Mavic 3 Thermal …0FN.

**2. Sjekklister som tilhører en sidestilt avdeling (Tensio Nord) og ikke er delt med Tensio Sør**
- «Sjekkliste - Before takeoff» på LN.0510.CA, **LN.0510.CX** og **LN.0510.DJ**
- «Normale sjekklister DJI Matrice-Mavic» på **LN.0510.AF** (både som operasjonssjekkliste og etter-flyging) og på Mavic 3 Thermal …0FN (etter-flyging)

Begge typer er usynlige i appen, kan ikke åpnes eller fjernes fra droneskjemaet, og er det som blokkerer flyturer.

## Det som skal gjøres

Fjerne disse koblingene fra de 14 dronene. Der en etter-flyging-sjekkliste peker på et utilgjengelig eller slettet dokument, settes den til ingen.

Etter opprydding sitter dronene igjen med sjekklistene som faktisk er tilgjengelige (Tensios «Nødsjekklister.pdf», «Normale sjekklister DJI Matrice-Mavic.pdf» og «SJEKKLISTE Matrice 4&30-serien»).

To droner blir stående uten sjekklister etter ryddingen: Mavic 3 Thermal …0FN i Tensio Sør og de av Tensio Nord-dronene som kun hadde den slettede nødsjekklisten. Jeg foreslår å koble på Tensios tilgjengelige versjoner («Nødsjekklister.pdf» og «Normale sjekklister DJI Matrice-Mavic.pdf») på disse, slik at ingen drone står helt uten – si fra hvis du heller vil gjøre det selv.

Ingen dokumenter slettes; kun koblinger fra droner endres.

## Teknisk

Én dataoppdatering på `drones` for de berørte radene:
- fjern `50094778-…`, `82f6e702-…`, `502115eb-…` og `a29dc8b4-…` fra `operations_checklist_ids`
- sett `post_flight_checklist_id = null` der den peker på `a29dc8b4-…`
- `sjekkliste_id` er allerede gyldig på alle berørte droner og røres ikke

Frontend-endringene fra forrige runde (utilgjengelige sjekklister vises med fjern-knapp og blokkerer ikke flystart) dekker allerede framtidige tilfeller, så ingen kodeendring er nødvendig her.
