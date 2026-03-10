## Plan: Fiks touch-scrolling i sjekkliste-popover (ikke z-index)

### Vurdering
Dette ser ikke ut som et z-index-problem (popover ligger allerede over dialogen). Mest sannsynlig stoppes/lekker touch-scroll i modal-kontekst, slik at finger-drag ikke flytter den indre listen.

### Endringer

1. **`src/components/StartFlightDialog.tsx`**
   - Behold søkefelt + liste, men oppgrader scroll-containeren:
     - `max-h-48 overflow-y-auto overflow-x-hidden [touch-action:pan-y] overscroll-contain`
     - legg til `onTouchMove={(e) => e.stopPropagation()}` på selve listecontaineren
   - Bruk en `ref` på listecontaineren og legg til native `wheel`-listener (`passive: false`) med samme mønster som i `src/components/ui/command.tsx`, slik at scroll blir “fanget” i lista og ikke dialogen.
   - (Valgfritt, men anbefalt) legg til inline style `WebkitOverflowScrolling: 'touch'` for bedre iOS-scroll.

2. **Verifisering i samme komponent**
   - Bekreft at følgende fortsatt virker:
     - trykk på sjekklistepunkt velger/lukker som før
     - søk filtrerer korrekt
     - ingen “side-scrollbar” overtar når man drar i listen

### Hvorfor dette bør løse feilen
- `touch-action: pan-y` tillater vertikal gesture i listeflaten.
- `onTouchMove stopPropagation` hindrer at dialog/body overtar touch-scroll.
- Native `wheel`-håndtering med `passive: false` matcher eksisterende fungerende mønster i appen for scrollbare lister inni portaled/modal UI.