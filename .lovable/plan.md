## Problem
I `src/pages/Changelog.tsx` bruker bilde-lightboxen `DialogContent` med `max-w-4xl p-2` og `<img className="w-full h-auto">`. For portrett-bilder (mobilscreenshots) blir bildet høyere enn skjermen, så dialogen vokser forbi viewport og Radix sin innebygde lukkeknapp (`X` plassert `top-4 right-4`) havner utenfor synlig område. Bildet dekker dessuten klikk-overlayen, så man får ikke lukket ved å klikke utenfor.

## Endringer i `src/pages/Changelog.tsx` (lightbox-dialogen nederst)

- Begrens dialog-høyden: `max-w-4xl max-h-[90vh] p-2 flex items-center justify-center bg-background/95` slik at innholdet aldri overgår viewport.
- Endre bildet til `max-h-[85vh] max-w-full w-auto h-auto object-contain` så portrett-bilder skaleres ned i stedet for å fylle siden.
- Legg til en egen, alltid synlig lukkeknapp øverst i høyre hjørne av dialogen (absolutt posisjonert, `z-10`, halvtransparent bakgrunn) i tillegg til Radix sin innebygde — sikrer at brukeren ser en X uansett bildehøyde og touch-enhet.
- Behold eksisterende `onOpenChange`-håndtering så Esc og klikk på overlay (utenfor det skalerte bildet) lukker dialogen.

Ingen andre filer eller logikk endres.
