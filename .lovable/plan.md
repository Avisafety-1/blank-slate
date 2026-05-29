## Problem

Hamburgermenyen bruker nå `Sheet` (Radix Dialog). To problemer:

1. **Skjermen blir sort:** `SheetOverlay` har `bg-black/80` som dekker hele appen, og selve panelet bruker `bg-card/95` (mørk card-token). Sammen blir alt nesten svart.
2. **Menyknappene fungerer ikke:** Hver knapp er pakket i `<SheetClose asChild>` rundt en `<Button onClick={navigate(...)}>`. På iPad/DJI ser vi at Sheet'en lukkes (unmount) før React-event-handleren rekker å trigge `navigate`, så navigeringen sluker.

## Fiks – `src/components/Header.tsx`

Beholder Sheet-design (sidepanel), men:

1. **Kontrollert open-state:** legg til `const [navOpen, setNavOpen] = useState(false)` og bruk `<Sheet open={navOpen} onOpenChange={setNavOpen}>`.
2. **Transparent overlay:** rendre Sheet via `SheetPortal` + `<SheetOverlay className="bg-transparent backdrop-blur-none" />` + `SheetPrimitive.Content` direkte – eller enklere: send en `className` på en wrapper. Konkret bruker vi `SheetPortal`/`SheetOverlay` som allerede eksporteres fra `@/components/ui/sheet`, og rendrer panelet manuelt så vi får styre overlay-bakgrunnen lokalt (`bg-transparent`). Resten av appen forblir synlig.
3. **Solid og lesbart panel:** bytt `bg-card/95` → `bg-popover text-popover-foreground border-l border-border shadow-2xl`.
4. **Ingen `SheetClose`-wrapping rundt knappene.** I stedet:
   ```tsx
   <Button onClick={() => { setNavOpen(false); navigate("/oppdrag"); }}>
   ```
   – `setNavOpen(false)` kjøres synkront, deretter `navigate` (begge skjer i samme handler, ingen race-condition med unmount).

## Resultat

- Sidepanelet kommer fortsatt inn fra høyre.
- Bakgrunnen blir ikke mørklagt – dashbordet vises klart bak.
- Klikk på menyknapper navigerer og lukker panelet pålitelig på iPad/DJI RC Pro.
- Lukkes også ved klikk utenfor (Radix sin default `onPointerDownOutside` på den transparente overlayen) og med X-knappen.

Ingen endringer i `sheet.tsx` (delt komponent) – kun lokal håndtering i `Header.tsx`.