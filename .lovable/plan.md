

# Fix: `crypto.randomUUID` polyfill for DJI RC Plus

## Problem

Skjermbildet viser feilen: `TypeError: crypto.randomUUID is not a function @ 1738:128667`

`crypto.randomUUID()` ble introdusert i Chrome 92. DJI RC Plus sin WebView er eldre (Chrome 70-87) og mangler denne funksjonen. Den brukes i 6 filer i prosjektet, inkludert på module-level i `OpenAIPMap.tsx` som krasjer ved import -- for ErrorBoundary kan fange noe.

## Losning

Legg til en **polyfill** tidlig i `src/main.tsx` (for alle importer) som definerer `crypto.randomUUID` hvis den mangler:

```typescript
// src/main.tsx - legg til OVERST, for alle andre importer
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  crypto.randomUUID = function() {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, function(c) {
      var r = crypto.getRandomValues(new Uint8Array(1))[0];
      return (Number(c) ^ (r & (15 >> (Number(c) / 4)))).toString(16);
    });
  };
}
```

Dette er en standard polyfill som bruker `crypto.getRandomValues` (tilgjengelig fra Chrome 11) til a generere UUID v4.

## Filer som endres

| Fil | Endring |
|---|---|
| `src/main.tsx` | Legg til `crypto.randomUUID` polyfill overst, for alle importer |

~7 linjer lagt til.

## Pavirkning

Ingen endring for moderne nettlesere -- polyfillen aktiveres kun hvis `crypto.randomUUID` ikke finnes. Pa DJI RC Plus vil den generere gyldige UUID-er via `crypto.getRandomValues`.

