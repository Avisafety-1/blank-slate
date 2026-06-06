## Mål
Vise hvilket selskap/avdeling statistikken gjelder rett under "Statistikk"-overskriften på `/status` (siden `src/pages/Status.tsx`).

## Logikk for visning
Bruke `companyName` og `parentCompanyName` fra `useAuth()` (allerede tilgjengelig i AuthContext):

- Hvis `parentCompanyName` er satt → bruker står i en avdeling:
  - Vis: `{parentCompanyName} – {companyName}`  
    (f.eks. `Tensio – Trøndelag`)
- Hvis ingen parent → bruker står i hovedselskap:
  - Vis: `{companyName} – alle avdelinger`  
    (f.eks. `Tensio – alle avdelinger`)

## Endringer
**`src/pages/Status.tsx`** (rundt linje 1334):
- Hente `companyName` og `parentCompanyName` fra `useAuth()` (companyName brukes allerede lenger ned i filen, så bare legge til parentCompanyName i destructure).
- Like under `<h1>Statistikk</h1>` legge til en liten undertekst:
  ```tsx
  <p className="text-sm text-muted-foreground -mt-2">
    {parentCompanyName ? `${parentCompanyName} – ${companyName}` : `${companyName} – alle avdelinger`}
  </p>
  ```
- Bruker eksisterende design tokens (`text-muted-foreground`), ingen nye stiler.

## Ikke berørt
- Ingen endringer i AuthContext, RLS, edge functions eller datahenting.
- Plattformstatistikk-siden (`src/pages/Statistikk.tsx` for Avisafe superadmin) er ikke det brukeren ser på her og endres ikke.

## Verifisering
- Som bruker i hovedselskap (Tensio): viser "Tensio – alle avdelinger".
- Som bruker i avdeling (Tensio Trøndelag): viser "Tensio – Trøndelag".
