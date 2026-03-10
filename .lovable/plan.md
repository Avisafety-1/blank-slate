

## Fix: Scrolling i sjekkliste-popover

### Problem
Radix `ScrollArea` krever en **fast høyde** på root-elementet for å aktivere scrolling. `max-h-48` alene fungerer ikke fordi den indre viewporten ikke begrenses.

### Løsning
Bytt ut `ScrollArea` med en enkel `div` med `overflow-y-auto max-h-48`. Dette er enklere og fungerer pålitelig i popovers på både desktop og mobil.

### Endring

**`src/components/StartFlightDialog.tsx`** (linje 854, 872)
- Erstatt `<ScrollArea className="max-h-48">` med `<div className="max-h-48 overflow-y-auto">`
- Erstatt `</ScrollArea>` med `</div>`

