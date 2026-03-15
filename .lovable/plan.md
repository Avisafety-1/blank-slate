
Mål: Brukeren skal ikke “låses” på blokkeringssiden. «Oppgrader plan» skal alltid gjøre noe meningsfullt, og siden skal ha en tydelig tilbakevei.

Rotårsak (funnet i koden):
- `PlanRestricted` sender kun `window.dispatchEvent('open-profile-subscription')`.
- Ingen komponent lytter på dette eventet nå.
- På `/admin` rendres ikke global `Header`, så `ProfileDialog` finnes ikke der når siden er blokkert.
- Resultat: knappen gjør ingenting + ingen tilbakeknapp i blokkeringsvisningen.

Plan for endring:

1) Gjør «Oppgrader plan» robust i `PlanRestricted`
- Legg inn `useNavigate` + `useLocation`.
- Oppgrader-knapp skal:
  - prøve å åpne abonnement-fanen via event (for sider hvor profil-dialog finnes),
  - og ha fallback: naviger til trygg rute (`/`) med state/query som betyr “åpne abonnement”.
- Dette sikrer at knappen alltid fungerer, også fra blokkert `/admin`.

2) Legg til faktisk event-håndtering i `ProfileDialog`
- Registrer listener for `open-profile-subscription`.
- Ved event: åpne dialog (`setProfileDialogOpen(true)`) og sett tab til `subscription`.
- Støtt også åpning via route state/query (fallback fra punkt 1), og nullstill state/query etter åpning.

3) Legg til tilbakehandling i `PlanRestricted`
- Sekundærknapp: «Tilbake».
- Logikk: `navigate(-1)` hvis mulig, ellers `navigate('/')`.
- Beholder «Oppgrader plan» som primær CTA.

4) Forbedre UX for blokkert fullside (særlig mobil)
- Hold nåværende låsekort, men legg inn tydelig knapperekkefølge:
  - Primær: Oppgrader plan
  - Sekundær: Tilbake
- Sikrer at brukeren alltid har en “exit”.

5) (Liten bonusfix) Fjern dialog-advarsel i console
- Legg til `DialogDescription` i `ProfileDialog` for å fjerne Radix advarsel om manglende description/aria-describedby.

Tekniske filer som oppdateres:
- `src/components/PlanRestricted.tsx`
- `src/components/ProfileDialog.tsx`
- (ev. liten støtte i `src/App.tsx` kun hvis vi velger query-basert åpning framfor state)

Akseptansekriterier:
- Starter-bruker klikker `/admin` → ser blokkering.
- Klikk «Oppgrader plan» → blir sendt til side med fungerende profil-dialog på Abonnement-fanen.
- Klikk «Tilbake» → kommer tilbake til forrige side (eller dashboard som fallback).
- Samme oppgrader-knapp fungerer også fra blokkert `/status` og `/hendelser`.
- Ingen “død” knapp lenger.
