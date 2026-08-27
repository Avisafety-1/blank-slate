# Fiks krasj ved åpning av nedtrekksmenyer (drone/pilot m.fl.)

## Hva som skjer

Feilen Brage fikk er React-feil #185 — «Maximum update depth exceeded», altså en uendelig oppdateringsløkke. Den kommer ikke fra selve «Avslutt flytur»-logikken, men fra den felles nedtrekksmenyen (`Select`) som brukes for drone og pilot. Det betyr at den kan slå til alle steder i appen der en `Select` med mange valg åpnes — ikke bare i denne dialogen.

## Årsak

I `src/components/ui/select.tsx` ble det nylig lagt egen scrolling på selve innholdsområdet (`Viewport`): `max-h-[min(70vh,24rem)]` + `overflow-y-auto`. Samtidig beholder menyen Radix sine egne rulleknapper (`SelectScrollUpButton` / `SelectScrollDownButton`), som måler om innholdet kan rulles og setter state ut fra det.

Når begge mekanismene er aktive samtidig kan de trigge hverandre: knappen vises → høyden endres → «kan rulle»-målingen endres → knappen skjules → høyden endres … Resultatet er en oppdateringsløkke som React stopper med feil #185, og hele siden faller ut i «Noe gikk galt».

## Endring

`src/components/ui/select.tsx`:
- Fjerne rulleknappene (`SelectScrollUpButton` / `SelectScrollDownButton`) fra `SelectContent`, slik at kun én scrollemekanisme er aktiv. Komponentene beholdes eksportert for bakoverkompatibilitet.
- Beholde den berøringsvennlige scrollingen på `Viewport` (høydebegrensning, `overflow-y-auto`, `touch-action: pan-y`, iOS-momentum), og legge til `overscroll-contain` slik at scroll ikke lekker til dialogen bak.
- Fjerne `onTouchMove`-stoppet, som ikke lenger trengs når scrollingen skjer i selve viewporten.

Ingen endringer i «Avslutt flytur»-dialogen, utstyrslista (egen Popover, uberørt) eller noen forretningslogikk.

## Verifisering

Åpne «Avslutt flytur», åpne drone-, pilot- og oppdragsvelgeren, scroll i lange lister på både mobil og desktop, og bekreft at listene ruller og at ingen feilskjerm dukker opp.
