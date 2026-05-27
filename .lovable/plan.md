# UI-gating av kompetanse-redigering for «bruker»

RLS-policyene gir vanlige brukere skrivetilgang gjennom legacy `saksbehandler`-aliaset i `has_role`, men siden ingen nye brukere får legacy-roller er det ikke et reelt problem i drift. Vi rører derfor ikke databasen, kun UI-en, slik at «bruker» ikke får trykket på handlingene i utgangspunktet.

## Endringer

### 1. `src/components/resources/PersonCompetencyDialog.tsx`
- Hent `user` fra `useAuth()` i tillegg til `isAdmin`.
- Beregn `canEdit = isAdmin || user?.id === person?.id`.
- Når `!canEdit`:
  - Skjul «Legg til kompetanse»-knappen (linje ~518).
  - Skjul rediger- og slett-ikonene på hver kompetanse-rad.
- Dialogen forblir lesbar (status, kompetanser, flygetidsstatistikk).

### 2. `src/pages/Resources.tsx`
- Skjul «Legg til kompetanse»-knappen i Personell-seksjonen (linje 809–817) for ikke-administratorer.

## Ikke i scope
- Ingen migrasjon. `has_role`-legacy-aliasene og RLS-policyene står som de er.
- Admins (`administrator`/`superadmin`) beholder full tilgang.
