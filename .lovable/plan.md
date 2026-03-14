

## Fikse visning av vedlegg på kompetansekort

### Problem

Koden lagrer `fil_url` korrekt, men `getFileDisplayUrl` bruker alltid `logbook-images`-bøtten. Filer valgt fra `/dokumenter` ligger i `documents`-bøtten (som er privat og krever signerte URL-er). I tillegg mangler det tydelig visuell indikasjon på vedlegg i view-modus.

### Løsning

**1. Fiks `getFileDisplayUrl` i `PersonCompetencyDialog.tsx`**

Oppdater funksjonen til å sjekke hvilken bøtte filen tilhører:
- Stier som inneholder `/competency-` → `logbook-images` (public, bruk `getPublicUrl`)
- Andre stier → `documents` (privat, bruk `createSignedUrl`)
- Fulle URL-er → returner direkte

**2. Gjør samme fix i `AddCompetencyDialog.tsx`**

Legg til visning av vedlegg etter lagring (vises allerede via `PersonCompetencyDialog`, men `AddCompetencyDialog` bruker også `getFileDisplayUrl`-lignende logikk).

**3. Forbedre visuell indikasjon i view-modus**

Gjør vedleggslenken mer synlig med et ikon-badge eller en tydelig knapp i stedet for bare en liten tekstlenke.

### Filer som endres

- `src/components/resources/PersonCompetencyDialog.tsx` — fiks `getFileDisplayUrl` for begge bøtter, gjør vedleggsvisning tydeligere
- `src/components/resources/AddCompetencyDialog.tsx` — same bucket-logikk for visning

