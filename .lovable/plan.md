## Problem

På DJI RC Pro (≈1024×768 landscape) og lignende små tablet-formater er viewport bredere enn 768 px, så `useIsMobile()` returnerer `false`. Da rendres desktop-raden for hver bruker i "Godkjente brukere" — en wide flex-wrap rad med 4–5 toggle-pillsboks + avdelingsvelger + rollevelger + slett-knapp. Det er ikke nok horisontal plass, så pillsene wrapper i et rotete 2-kolonners mønster (se skjermbilde).

## Løsning

Bruk det eksisterende kompakte mobil-layoutet (navn → popover med alle innstillinger) også for "medium" skjermer opp til `lg` (1280 px). Det fungerer godt på DJI RC Pro samtidig som ekte desktop beholder dagens brede rad.

### Endring (kun `src/pages/Admin.tsx`)

1. Legg til en bredde-sjekk ved siden av eksisterende `useIsMobile()`:
   ```ts
   const [isCompactAdmin, setIsCompactAdmin] = useState(false);
   useEffect(() => {
     const mq = window.matchMedia('(max-width: 1279px)');
     const update = () => setIsCompactAdmin(mq.matches);
     update();
     mq.addEventListener('change', update);
     return () => mq.removeEventListener('change', update);
   }, []);
   ```
2. I "Godkjente brukere"-listen (linje ~1217–1587):
   - Erstatt `{isMobile ? (...popover...) : (...desktop navn...)}` med `{isCompactAdmin ? ... : ...}`.
   - Erstatt `{!isMobile && (...desktop pills/select/delete...)}` med `{!isCompactAdmin && (...)}`.
3. Ingen logikkendringer; popover-innholdet og desktop-raden er uendret.

### Hva som IKKE endres

- Andre `isMobile`-bruk i Admin.tsx (kommentar-felt, andre seksjoner) beholdes som før.
- Ingen endringer i datalag, RLS, edge functions, eller andre faner.
- Header/hamburger-fix fra forrige iterasjon røres ikke.

## Resultat

På DJI RC Pro vises hver bruker som én ryddig linje med navn + e-post; trykk åpner popover med alle toggles, avdeling, rolle og slett — samme polert mobil-UX som på telefon. På desktop ≥1280 px ser raden ut som i dag.