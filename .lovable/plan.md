# Fiks plassering av lukk-kryss (X) på dialoger

## Problem
På iPhone (Safari/Chrome med notch) legger lukk-krysset seg langt nede i dialogen og overlapper "Vis alle"-chip, blyant/søppelbøtte-knapper og andre handlinger i header-området. Synlig i begge skjermbildene fra brukeren.

## Årsak
I `src/components/ui/dialog.tsx` linje 98 brukes:

```
top-[max(1rem,env(safe-area-inset-top,1rem))]
```

`env(safe-area-inset-top)` er ment for elementer som ligger inntil viewportens topp (f.eks. fullskjerm-headers). Dialogen er sentrert i viewporten, men `position: absolute` på X-en er relativ til dialogboksen — likevel evaluerer nettleseren `env()` mot device safe-area (~47px på iPhone med notch). Resultat: X-en dyttes ~47px ned i dialog-innholdet i stedet for å sitte i hjørnet.

## Endring
Bytt til en enkel, fast posisjon i øvre høyre hjørne av dialogen:

```
top-4
```

(matcher `right-4` som allerede er fast). Da ligger X-en alltid 16px fra dialogens topp/høyre, uavhengig av device — som er korrekt fordi safe-area gjelder viewport, ikke en sentrert modal.

## Filer
- `src/components/ui/dialog.tsx` (én linje)

## Ikke berørt
- `sheet.tsx`, `alert-dialog.tsx` (bruker allerede `top-4`).
- Ingen logikk- eller layout-endringer i dialoger som bruker komponenten.
