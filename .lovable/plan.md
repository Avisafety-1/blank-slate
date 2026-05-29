# Hamburgermeny – fiks for DJI RC Pro (Android 10 / Chrome 70)

## Problem
På DJI RC Pro lukker `DropdownMenu` seg umiddelbart når den åpnes, og brukeren navigeres til `/oppdrag` (første menyvalg) når man trykker på hamburgerikonet på sider som `/kart` eller `/oppdrag`. På dashbordet skjer det ikke fordi det første menypunktet "Oppdrag" treffer en nøytral del av dashboardet under fingertuppen.

## Årsak
Dette er en klassisk "ghost click" på eldre WebView (Chrome 70 / Android 10, jf. memory `dji-rc-plus-compatibility`):
1. `touchstart`/`touchend` på trigger åpner Radix DropdownMenu.
2. ~300 ms senere fyrer den syntetiske `click`-eventen på samme skjermkoordinat.
3. Da har dropdown-innholdet allerede åpnet seg under fingeren, og første `DropdownMenuItem` ("Oppdrag") mottar klikket → `navigate("/oppdrag")` + meny lukkes.
4. På dashbordet ligger ingen klikkbar Radix-item under fingeren ennå når det skjer (timing/layout), så menyen virker stabil.

## Løsning
Bytt mobil-hamburgermenyen i `src/components/Header.tsx` fra `DropdownMenu` til `Sheet` (side-drawer, basert på Radix Dialog). Sheet:
- Bruker modal overlay → ghost-click på menypunktet rett under trigger forhindres av overlayet/animasjonen.
- Er allerede installert i `src/components/ui/sheet.tsx`.
- Fungerer stabilt på eldre Android WebView.

### Endringer (kun `src/components/Header.tsx`)
1. Fjern `DropdownMenu`/`DropdownMenuContent`/`DropdownMenuItem`/`DropdownMenuTrigger`-imports for mobilmenyen (behold for evt. andre menyer hvis brukt – sjekkes).
2. Importer `Sheet, SheetTrigger, SheetContent, SheetClose` fra `@/components/ui/sheet`.
3. Kontrollert state: `const [navOpen, setNavOpen] = useState(false)`.
4. Erstatt mobilmenyen med en `Sheet` (side="right", w-72). Hver nav-knapp blir en `SheetClose asChild` + `Button variant="ghost"` som kaller `navigate(...)` og lukker arket.
5. Behold `data-tour="mobile-nav-trigger"` og `data-tour="nav-*"` attributtene så guided tour fortsatt virker.
6. Beholder den eksisterende tour-pause-logikken (ikke lukk ved outside click hvis `system-overview`-tour er aktiv) via `onPointerDownOutside`/`onEscapeKeyDown`-prevent på `SheetContent`.

Ingen endringer i desktop-navigasjonen, ingen endringer i andre filer.

## Verifisering
- Test i preview på mobil-bredde at meny åpner og lukker uten å navigere.
- Bekreft at "Driftstatus", "Installer app", "Admin"-osv. fortsatt fungerer.
- Bekreft at guided tour fortsatt finner `mobile-nav-trigger` og `nav-*` selectors.
