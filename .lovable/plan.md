

## Legg til rekkefølge-endring for sjekklistepunkter

### Problem
GripVertical-ikonet vises allerede på sjekklistepunkter i både `CreateChecklistDialog` og `DocumentCardModal`, men det er kun dekorativt — ingen drag-and-drop eller annen rekkefølge-funksjonalitet er implementert.

### Løsning: Opp/ned-knapper (enklest og mest pålitelig)
Legge til opp/ned-piler (ChevronUp/ChevronDown) på hvert sjekklistepunkt i stedet for det dekorative GripVertical-ikonet. Dette er robust på både desktop og mobil/iPad uten ekstra avhengigheter.

### Endringer

**1. `src/components/documents/CreateChecklistDialog.tsx`**
- Erstatt `GripVertical`-ikonet med to knapper: `ChevronUp` og `ChevronDown`
- Legg til `handleMoveItem(id, direction)` som bytter plass på to elementer i `items`-arrayet
- Deaktiver opp-knapp på første element, ned-knapp på siste

**2. `src/components/documents/DocumentCardModal.tsx`**
- Samme endring i sjekkliste-redigeringsseksjonen (~linje 389-412)
- Legg til tilsvarende `handleMoveChecklistItem(id, direction)` funksjon
- Erstatt `GripVertical` med opp/ned-knapper

### Hjelpefunksjon (i begge filer)
```typescript
const handleMoveItem = (id: string, direction: 'up' | 'down') => {
  setItems(prev => {
    const idx = prev.findIndex(item => item.id === id);
    if (idx < 0) return prev;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= prev.length) return prev;
    const next = [...prev];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    return next;
  });
};
```

### UI per punkt
```text
[▲][▼] 1. [Beskriv sjekk-punktet...        ] [🗑]
```

Ingen nye avhengigheter. Ingen databaseendringer.

