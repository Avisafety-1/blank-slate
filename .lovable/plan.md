

# Fix: Lukkeknapp bak iOS-statuslinja i fullskjerm-dialoger

## Problem
Lukkeknappen (X) i `DialogContent` er posisjonert med `top-4` (16px). På iPhone PWA i fullskjermsmodus dekker statuslinjen (ca. 47-59px) denne knappen, noe som gjør den nesten umulig å trykke på.

## Løsning

### `src/components/ui/dialog.tsx` (linje 98)
Endre close-knappens posisjonering fra fast `top-4` til å respektere iOS safe area:

```
top-4  →  top-[max(1rem,env(safe-area-inset-top,1rem))]
```

Dette sørger for at knappen alltid er minimum 16px fra toppen, men skyves ned til under statuslinjen på iOS PWA-enheter der `safe-area-inset-top` er satt.

### `src/components/dashboard/ExpandedMapDialog.tsx` (linje 580)
Legg til safe-area-padding på `DialogHeader` slik at tittelen også flyttes ned:

```
px-3 py-2  →  px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top,0.5rem))]
```

En-fil endring som fikser problemet globalt for alle fullskjerm-dialoger, uten å påvirke vanlige dialoger (der safe-area-inset-top er 0).

