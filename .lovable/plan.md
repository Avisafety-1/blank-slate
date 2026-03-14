

## Mobiloptimalisering av «Legg til utstyr»-dialogen

### Problem

Når utstyrsnavn er langt (f.eks. «Batteri 1Z6PK54FA400GC»), skyves «Legg til»-knappen ut av skjermen fordi navn og knapp ligger på samme rad uten at navnet begrenses.

### Endringer

**`src/components/resources/AddEquipmentToDroneDialog.tsx`**

Endre layout for hvert utstyrskort fra horisontal (navn + knapp side om side) til **stablet på mobil**:

1. **Navneteksten** (`h4`) får `break-all` / `min-w-0` slik at lange strenger brytes
2. **Knappen** flyttes under innholdet på mobil — full bredde. På desktop beholdes den ved siden av.
3. Samme endring for DroneTag-kortene (linje ~310