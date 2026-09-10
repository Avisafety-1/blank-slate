# Sjekklister fra oppdragstype henger

## Hva som skjer i dag

To ting kan gjøre at sjekklisten «bare henger» når man velger en oppdragstype med sjekklister:

1. Sjekklistevinduet starter alltid i «Laster…»-tilstand. Hvis det åpnes i det øyeblikket oppdraget ennå ikke har levert sjekkliste-ID-ene sine, velges ingen sjekkliste, og lastingen slås aldri av igjen. Vinduet blir stående på «Laster…» selv når ID-ene kommer like etter.
2. Ved oppretting av nytt oppdrag hentes sjekklistene fra listen brukeren selv har huket av, ikke fra den utvidede listen som også inneholder dokumentene oppdragstypen legger til automatisk. I noen tilfeller (f.eks. når oppdragstypen settes før dokumentlisten er lastet) blir dokumentene lagt på oppdraget, men ikke registrert som sjekklister — da mangler sjekklistemerket helt.

## Hva som fikses

- Sjekklistevinduet slutter å henge: har oppdraget ingen sjekklister ennå, vises ingen evig lasting, og så snart sjekklistene finnes velges den første automatisk — også når de kommer etter at vinduet ble åpnet.
- Nye oppdrag får alltid registrert sjekklistene som følger med valgt oppdragstype, ikke bare de brukeren huket av manuelt.

Ingen endringer i database eller tilganger.

## Teknisk

`src/components/resources/ChecklistExecutionDialog.tsx`
- Init-effekten kjører også når `checklistIds` endrer seg (dep på `checklistIds.join(",")`), ikke bare på `open`-flanken, slik at ID-er som ankommer etter åpning fortsatt setter `activeChecklistId`.
- Når dialogen er åpen og `checklistIds.length === 0`: sett `isLoading` til `false` (og tøm `items`), så «Laster…» ikke låser seg.
- Behold nullstilling av `checkedByTab`/PDF-state kun ved reell åpning (`open && !prevOpenRef.current`), så tilstanden ikke blåses bort når ID-listen oppdateres.

`src/components/dashboard/AddMissionDialog.tsx`
- I opprettingsflyten: utled `checklistDocIds` fra `effectiveSelectedDocs` i stedet for `selectedDocuments`, før sammenslåing med dronenes `operations_checklist_ids`.

Verifisering: `npx tsgo --noEmit -p tsconfig.app.json`.
