## Mål
Legg til en språkvelger (NO/EN) på innloggingssiden `/auth`, siden bruker ikke er logget inn eller knyttet til selskap enda.

## Endring
- I `src/pages/Auth.tsx`: legg til en liten `Globe`-toggle-knapp øverst til høyre (over kortet), samme visuelle stil som `LanguageToggleButton` i `Header.tsx` (ghost icon, `Globe` + språkbadge).
- Klikk kaller `i18n.changeLanguage(target)` direkte (ikke `setLanguage()` fra `i18nHelpers`, siden den prøver å persistere til `profiles` og ville logge advarsel når ingen bruker er logget inn).
- Bruker `getCurrentLanguage()` for å vise nåværende språk.
- Overstyres fortsatt automatisk av selskapets `default_language` når bruker skriver inn en gyldig registreringskode (eksisterende oppførsel beholdes).

## Filer
- `src/pages/Auth.tsx` (én liten UI-tilføyelse)

Ingen nye i18n-nøkler nødvendig — gjenbruker `header.switchToLanguage`.
