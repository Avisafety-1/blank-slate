# Alle sjekklister på nye oppdrag henger

## Hva som skjer i dag

Databasen viser at de helt nye testoppdragene faktisk har gyldige sjekkliste-ID-er, også oppdraget «Test sjekkliste» fra 18:36. Problemet ligger derfor i åpningen av sjekklistevinduet på nye oppdrag, ikke i selve sjekklistedataene.

Sjekklistevinduet starter alltid i «Laster…»-tilstand. Når et nytt oppdrag åpnes før den oppdaterte oppdragsraden har kommet inn i listen, mottar vinduet først en tom ID-liste og velger ingen aktiv sjekkliste. Effekten lytter bare på om vinduet åpnes, ikke på at ID-listen kommer etterpå. Dermed starter aldri dokumenthentingen, og «Laster…» blir stående permanent. Dette forklarer hvorfor problemet rammer nye oppdrag generelt.

Det finnes i tillegg en egen lagringsfeil for sjekklister som følger automatisk med en oppdragstype: dokumentkoblingen bruker den utvidede dokumentlisten, mens `checklist_ids` fortsatt beregnes fra bare brukerens manuelle valg. Den rettes samtidig slik at nye oppdrag blir konsistente.

## Hva som fikses

- Sjekklistevinduet slutter å henge: har oppdraget ingen sjekklister ennå, vises ingen evig lasting, og så snart sjekklistene finnes velges den første automatisk — også når de kommer etter at vinduet ble åpnet.
- Nye oppdrag får alltid registrert sjekklistene som følger med valgt oppdragstype, ikke bare de brukeren huket av manuelt.
- Oppdragslisten oppdateres etter oppretting før en sjekkliste kan åpnes, slik at vinduet ikke starter med en foreldet oppdragsrad.

Ingen endringer i database eller tilganger.

## Teknisk

`src/components/resources/ChecklistExecutionDialog.tsx`
- Init-effekten kjører også når `checklistIds` endrer seg (dep på `checklistIds.join(",")`), ikke bare på `open`-flanken, slik at ID-er som ankommer etter åpning fortsatt setter `activeChecklistId`.
- Når dialogen er åpen og `checklistIds.length === 0`: sett `isLoading` til `false` (og tøm `items`), så «Laster…» ikke låser seg.
- Behold nullstilling av `checkedByTab`/PDF-state kun ved reell åpning (`open && !prevOpenRef.current`), så tilstanden ikke blåses bort når ID-listen oppdateres.

`src/components/dashboard/AddMissionDialog.tsx`
- I opprettingsflyten: utled `checklistDocIds` fra `effectiveSelectedDocs` i stedet for `selectedDocuments`, før sammenslåing med dronenes `operations_checklist_ids`.

Opprettingsflyten på `/oppdrag`
- Kontroller og stram inn oppfriskningen etter lagring, slik at det nye oppdraget i listen inneholder lagrede `checklist_ids` før sjekklisteknappen brukes.

Verifisering: typekontroll og nettlesertest med et nytt oppdrag som har én og flere sjekklister, både manuelt valgt og arvet fra oppdragstype/drone.
