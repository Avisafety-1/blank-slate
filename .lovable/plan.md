## Problem
Lange filnavn med understreker (f.eks. `SORA_Assessment_BVLOS_Lifting_operations.pdf`) brytes ikke, så `DialogTitle` i `src/components/dashboard/DocumentDetailDialog.tsx` presser dialogen utenfor mobilskjermen.

Samme mønster gjelder også titler i listevisningen (`DocumentsList`) hvor de avkortes med `...`.

## Endring
**`src/components/dashboard/DocumentDetailDialog.tsx` (linje 277):**
Legg til `break-words [overflow-wrap:anywhere] pr-2` på `DialogTitle` slik at lange filnavn uten mellomrom brytes over 2+ linjer på smal skjerm.

```tsx
<DialogTitle className="text-lg sm:text-xl break-words [overflow-wrap:anywhere] pr-2">
  {document.tittel}
</DialogTitle>
```

Ingen andre endringer – listevisningens `truncate` beholdes som i dag siden brukeren kun rapporterte detaljdialogen.
