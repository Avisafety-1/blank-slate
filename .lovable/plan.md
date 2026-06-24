## Problem

På iPhone 13 Pro bruker `SignatureDrawerDialog` en rotert «landskaps»-layout på mobil (`flex-row` med vertikal header til venstre og vertikal footer til høyre). Resultatet:

- Footeren med Tøm/Angre/Lagre-knappene havner utenfor synlig område.
- Canvas-en virker enorm fordi den fyller hele bredden uten å regne med adressefelt/safe-area.
- Brukeren kan ikke zoome eller scrolle for å nå knappene.

## Plan

Endre kun `src/components/SignatureDrawerDialog.tsx` (frontend, ingen logikk-endring i lagring eller storage).

1. **Felles vertikal layout** på mobil og desktop: header øverst, canvas i midten, footer nederst. Drop `isMobile`-grenen som setter `flex-row` og roterer header/footer.
2. **Viewport-bundet høyde**: container bruker `h-[100dvh]` + `pt-[env(safe-area-inset-top)]` + `pb-[env(safe-area-inset-bottom)]` slik at iOS-adressefelt og hjemmeindikator ikke skjuler innholdet.
3. **Canvas fyller midten uten å overflowe**: `<div className="flex-1 min-h-0 p-4">` rundt canvas, canvas selv `w-full h-full`.
4. **Fjern canvas-rotering på lagring**: slett `rotateCanvasForSave`-funksjonen og `isMobile`-grenen i `handleSave`. Signaturen lagres nå i samme orientering som tegnet (portrett).
5. **Footer alltid synlig**: horisontal rad nederst med Tøm + Angre til venstre og Lagre til høyre, alle med tekstetiketter også på mobil.

Ingen endringer i edge functions, DB, storage-bucket eller andre komponenter. `useIsMobile`-import fjernes hvis den ikke lenger brukes.
