

## Plan: Scrollbar og søk i sjekkliste-popover

### Problem
Popoveren som viser tilgjengelige sjekklister i StartFlightDialog har ingen scrollbar eller søkefunksjon — på mobil (360px) kan listen gå utenfor skjermen.

### Endringer

**`src/components/StartFlightDialog.tsx`** (linje 845-858)

Erstatt den enkle `PopoverContent` med:
1. Et søkefelt (`Input`) øverst med placeholder «Søk sjekklister…»
2. En `ScrollArea` med `max-h-48` rundt listen
3. Filtrer `availableChecklists` basert på søketekst (case-insensitive match på tittel)
4. Vis «Ingen treff»-melding når filtreringen gir 0 resultater
5. Legg til lokal state `checklistSearch` som nullstilles når popoveren lukkes

