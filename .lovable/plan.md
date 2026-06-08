# Stable lanes for overlapping events in resource calendar

I `ResourceTimeline.tsx` (Kalender → Ressurskalender) renderes alle hendelser i en rad med `position:absolute; top:1`. Overlappende oppdrag legger seg dermed oppå hverandre (jf. screenshot: «SAR61 demo» og «DEMO – Søk savnet person» på samme batteri/personell).

## Endring
- For hver `ResourceRow` (innenfor uka som rendres): kjør en enkel **lane-tildeling** på `visibleEvents`. Sorter etter `start` (sekundært etter `end`); for hver hendelse, plasser den i første eksisterende lane der forrige hendelse slutter ≤ den nye starter, ellers åpne en ny lane. Returnerer `{ event, lane }[]` + `laneCount`.
- I `renderEventBlock`: ta inn `lane` og bruk `top: 4 + lane * 30` (px) i stedet for `top-1`. Behold høyde `h-7` (28 px) + 2 px luft.
- I rad-containeren: bytt `min-h-[36px]` til dynamisk `style={{ minHeight: 8 + laneCount * 30 }}` så rad vokser vertikalt etter behov.
- Lane-tildelingen kjøres i `renderSection` per rad (memoisering ikke nødvendig — datamengden er liten, og raden re-rendres uansett ved ukeskift).

## Hva som IKKE endres
- Ingen endring i datamodell, RLS, eller spørringer.
- Konflikt-ringen (`ring-amber-400`) og tooltipet beholdes uendret — den brukes fortsatt for visuell varsling.
- Månedsoversikt og andre kalendervisninger berøres ikke.

## Filer
- `src/components/dashboard/ResourceTimeline.tsx` (kun denne)

## Verifisering
- Sjekke samme uke som i screenshot: «SAR61 demo» og «DEMO – Søk savnet person» skal nå ligge i hver sin sub-rad under samme batteri/personell, uten å skjule hverandre.
- Rader uten overlapp skal se ut som før (samme høyde).
