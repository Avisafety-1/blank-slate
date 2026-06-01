## Problem
Mobilnavigasjonen (Sheet i `src/components/Header.tsx`, linje 172-273) bruker `h-full flex flex-col` uten `overflow-y-auto`. På DJI RC Pro-kontrolleren er skjermen så lav at menyinnholdet (Kart, Oppdrag, Ressurser, Dokumenter, Kalender, Hendelser, Status, evt. superadmin-lenker, Driftstatus, Installer, språkbytte, Start tour, footer) blir høyere enn viewport, og innholdet blir kuttet uten mulighet for å scrolle.

## Endring
Én målrettet UI-endring i `src/components/Header.tsx` på `SheetPrimitive.Content` (linje 172-173):

1. Legg til `overflow-y-auto overscroll-contain` på selve panelet så hele menyen blir scrollbar når den er høyere enn skjermen.
2. Fjern `mt-auto` fra footer-div (linje 259) — `mt-auto` krever at containeren har ledig plass, og når innholdet overskrider høyden hindrer det riktig scroll-oppførsel. Footer får i stedet en vanlig `pt-4 mt-4` slik at den følger med innholdet og scroller med.
3. Behold `pt-10` (plass til lukkeknapp øverst) og legg til litt `pb-4` for pusterom nederst.

Ingen logikk-, rute- eller komponentstruktur-endringer. Kun klassesetting på to elementer i Sheet-panelet.

## Verifisering
- Sjekk i preview på 360×571 (DJI RC Pro-lignende) at hamburgermenyen kan scrolles og at alle elementer inkludert footer er tilgjengelige.
- Sjekk på desktop og standard mobil at oppførselen er uendret når innholdet får plass.
