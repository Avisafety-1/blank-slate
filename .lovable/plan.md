

## Problem
På mobil er "Legg til innlegg"-skjemaet i loggbok-dialogene ikke scrollbart. Skjemaet (Type, Dato, Tittel, Beskrivelse, Bilde, Lagre/Avbryt) ligger som et fast blokk *over* Tabs/ScrollArea inne i en `max-h-[90vh] flex flex-col`-dialog. Når bilde-forhåndsvisning legges til, presses bunnen (Bilde-label + Lagre/Avbryt-knapper) ut av synlig område — synlig i skjermbildet hvor "Bilde (valgfritt)" og bildet er klippet av telefonens navigasjonsfelt.

Berørte filer (samme mønster):
- `src/components/resources/DroneLogbookDialog.tsx`
- `src/components/resources/EquipmentLogbookDialog.tsx`
- `src/components/FlightLogbookDialog.tsx`

## Løsning
Gjør "Legg til innlegg"-skjemaet scrollbart på mobil, og sørg for at Lagre/Avbryt alltid er synlig.

### Endringer per dialog (samme oppskrift)

1. **Wrap skjema-blokken i en scrollbar container** når `showAddEntry` er åpen:
   - Legg til `max-h-[60vh] overflow-y-auto` på den ytre `<div>` rundt skjemaet, slik at hele skjemaet (inkl. bilde + knapper) kan scrolles på små skjermer.
   - Behold knappradene (`Lagre`/`Avbryt`) *inne i* skjemaet slik at de scroller med — alternativt sticky bunn (`sticky bottom-0 bg-muted/30 pt-2`).

2. **Reduser bilde-preview-høyden litt på mobil** slik at det tar mindre vertikal plass:
   - Endre `h-24` → `h-20 sm:h-24` på `<img>`.

3. **Skjul Tabs/historikk-listen mens man legger til innlegg på mobil**, slik at hele dialog-høyden blir tilgjengelig for skjemaet:
   - Wrap `<Tabs ...>` med `className={cn("flex-1 flex flex-col min-h-0", showAddEntry && "hidden sm:flex")}`.
   - På desktop fortsetter alt som før (begge synlig).

4. **Sticky knapprad** i skjema-blokken slik at Lagre/Avbryt alltid er innenfor scroll-vinduet:
   ```
   <div className="flex gap-2 sticky bottom-0 bg-muted/30 pt-2 -mx-3 sm:-mx-4 px-3 sm:px-4 pb-1">
   ```

### Verifisering
- Mobil 360×640: åpne drone-loggbok → "Legg til innlegg" → fyll Tittel + Beskrivelse + last opp bilde → bekreft at hele skjemaet kan scrolles og at Lagre/Avbryt-knappene er synlige og klikkbare.
- Gjenta for utstyr-loggbok og flight-loggbok.
- Desktop: bekreft at Tabs/historikk fortsatt vises ved siden av/under skjemaet uten layout-regresjon.

### Filer som endres
- `src/components/resources/DroneLogbookDialog.tsx`
- `src/components/resources/EquipmentLogbookDialog.tsx`
- `src/components/FlightLogbookDialog.tsx`

Ingen DB- eller logikk-endringer — kun mobil-layout-fix.

