Legg til en "Start opplæring"-knapp i hamburgermenyen, plassert under språkvelgeren med en horisontal skillelinje over (samme stil som de andre skillene i menyen).

Endring i `src/components/Header.tsx`:
- Etter `English/Norsk`-knappen (linje 256) legges det inn:
  - `<div className="my-2 border-t border-border" />`
  - En `StartTourButton` med `variant="default"` og `className="justify-start w-full"` slik at den matcher de andre menyknappene visuelt (ikon + tekst, venstrejustert).
- `StartTourButton` beholdes uendret andre steder (profilsidens kompetansefane og desktop-header).
- Bruker eksisterende dropdown-funksjonalitet: klikk åpner liste over tilgjengelige tourer.

Ingen andre filer endres.