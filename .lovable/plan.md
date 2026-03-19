

## Plan: Fiks mobil-layout for "Legg til logginnlegg" i FlightLogbookDialog

### Problemet
Dialogen har `max-h-[90vh]` med `flex flex-col`, men innholdet mellom header og tabs (oppsummering + handlingsknapper + skjemaet for nytt logginnlegg) er **ikke scrollbart**. Når "Legg til logginnlegg"-skjemaet utvides på mobil (390px), skyves innholdet ut av skjermen nedover uten mulighet for å scrolle.

### Løsningen
Wrap hele innholdsområdet etter DialogHeader i én `ScrollArea` slik at alt er scrollbart. Fjern den eksisterende indre ScrollArea fra TabsContent (som da blir unødvendig) eller behold den som nested scroll for lange lister.

### Fil som endres

**`src/components/FlightLogbookDialog.tsx`**

1. Wrap innholdet fra linje ~405 (summary-div) til slutten av Tabs (~linje 587+) i en `<ScrollArea className="flex-1 min-h-0">` 
2. Fjern `flex-1 flex flex-col min-h-0` fra Tabs-wrapperen (ikke lenger nødvendig for layout)
3. Endre de indre ScrollArea-komponentene i TabsContent fra fixed høyde (`h-[calc(90vh-26rem)]`) til en mer fleksibel `max-h-[50vh]` eller fjern dem helt siden ytre scroll nå håndterer overflow
4. Sikre at skjemaet ("Legg til logginnlegg") og knappene forblir tilgjengelige ved å scrolle

### Resultat
På mobil kan brukeren scrolle nedover for å se hele skjemaet inkludert "Lagre"/"Avbryt"-knappene, uten at innholdet forsvinner utenfor skjermen.

