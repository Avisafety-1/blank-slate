Plan for å fikse admin-guiden:

1. Gjør fanebytte robust ved å styre Admin-fanene kontrollert
- Endre `Tabs` på admin-siden fra `defaultValue` til kontrollert `value`/`onValueChange`.
- Eksponer en liten global custom event, f.eks. `avisafe:set-admin-tab`, som setter aktiv fane direkte til riktig `TabsContent`.
- Dette unngår at touren må simulere klikk/pointer-events mot Radix Tabs, som er ustabilt spesielt på mobil og når overlay er aktiv.

2. Oppdater `adminTour.ts` til å åpne faner via event i stedet for syntetiske klikk
- Erstatt dagens `clickTab()` med en helper som:
  - finner tab-triggeren,
  - leser Radix `value`,
  - sender custom event til Admin-siden,
  - venter til riktig trigger har `data-state="active"` og riktig innhold er synlig.
- Behold `optional`-logikken for SORA og andre betingede elementer.

3. Fiks “låst kurs-modus” etter X/Hopp over/Fullfør
- Stram opp cleanup i `GuidedTourProvider.tsx` slik at den alltid:
  - fjerner `avisafe-tour-active`, `avisafe-tour-map-interaction` og `data-tour-id`,
  - rydder `driverRef.current`,
  - fjerner eventuelle gjenværende driver-overlays/popovers/aktive element-klasser,
  - nullstiller body-stiler som kan blokkere klikk (`pointer-events`) hvis en tidligere dialog/tour-kombinasjon har etterlatt siden låst.
- Unngå dobbel destroy-loop ved å samle avslutning i én trygg `finish/cleanup`-funksjon.

4. Verifiser i preview
- Start admin-touren, gå gjennom flere steg på mobilbredde, og sjekk at fanene bytter til Kunder, E-post, SORA/Mitt selskap/Opplæring når stegene krever det.
- Trykk X midt i touren og bekreft at overlay/popover forsvinner og siden igjen kan klikkes normalt.