# Gjennomgang: rulling på DJI RC Pro i resten av appen

## Funn
Hovedfeilen (høyde oppgitt bare på den nye måten som kontrolleren ikke forstår) finnes nå bare fire steder:

1. **Vedlikehold-siden** – to vinduer (`src/pages/Vedlikehold.tsx`, linje ~1191 og ~1256) bruker kun `max-h-[90dvh]` / `max-h-[85dvh]`. På kontrolleren får de ingen høydegrense og innholdet kuttes i stedet for å rulle. **Må fikses.**
2. **Signaturtegning** (`SignatureDrawerDialog.tsx`) – fullskjermvisning med `height: "100dvh"` alene. Kan bli feil høyde på kontrolleren. **Bør fikses.**
3. **DJI Cloud-innlogging** (`DjiCloudLogin.tsx`) – `min-h-[100dvh]` alene. Påvirker bare minstehøyde, ikke rulling, men siden brukes nettopp på kontrolleren. **Liten fiks.**

Alle andre steder (ressurser, loggbøker, batteri, flyloggbehandling, logg flytid) har allerede riktig oppsett.

I tillegg har ca. 38 rullende vinduer høyde i riktig format, men mangler den ekstra fingerrulle-innstillingen. De fungerer i dag (f.eks. drone-detaljer), så dette er kun forebyggende.

## Endringer
1. Legg til `vh`-fallback foran `dvh` i de tre filene over (Vedlikehold: `max-h-[90vh] max-h-[90dvh]` og `max-h-[85vh] max-h-[85dvh]`, pluss `[touch-action:pan-y]` på rullefeltet inni; Signatur: `height: 100vh` først, så `100dvh` via CSS-klasse `h-[100vh] h-[100dvh]`; DJI Cloud: `min-h-[100vh] min-h-[100dvh]`).
2. Forebyggende: legg `[touch-action:pan-y] [-webkit-overflow-scrolling:touch]` på rullende vinduer som brukes i felt: oppdragsdetaljer, nytt oppdrag, SORA-analyse, NOTAM, hendelser, avvik, drone-/utstyrs-/personlister fra dashbordet, dokumenter, kalender, FlightHub 2-sending og live-video. Admin- og markedsføringsvinduer holdes utenfor.

## Tekniske detaljer
- Kun klasse-/stilendringer, ingen logikk, database eller tekst.
- Utseende på PC/iPad/mobil uendret.
- Verifisering: build, typesjekk og søk som bekrefter at ingen `dvh` står uten `vh`-fallback. Endelig test må gjøres på RC Pro.
