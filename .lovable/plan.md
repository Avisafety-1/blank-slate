

## Tydligere visuell separasjon på «Oppdrag til godkjenning»

### Problem
Oppføringene i godkjenningslisten bruker `border border-border` som er subtilt og gjør at de flyter sammen visuelt.

### Løsning
Bruk samme visuell stil som selskapsinnstillingene: `rounded-lg border-2 border-primary/30 bg-muted/30 p-4`. I tillegg legge til litt mer spacing mellom oppføringene (`space-y-4` i stedet for `space-y-3`).

### Fil som endres
**`src/components/ProfileDialog.tsx`** — én endring:

Linje ~1780-1784: Endre wrapper-div per oppdrag fra:
```
className="p-3 rounded-lg border border-border space-y-2 cursor-pointer hover:bg-accent/50"
```
til:
```
className="p-4 rounded-lg border-2 border-primary/30 bg-muted/30 space-y-2 cursor-pointer hover:bg-accent/50"
```

Og endre `space-y-3` på container-diven (linje ~1780) til `space-y-4` for mer luft mellom kortene.

