

## Avdelingsmarkering i moderselskapet

### Problem
Når et moderselskap ser data fra alle avdelinger (oppdrag, hendelser, dokumenter), er det ingen visuell indikator som viser hvilken avdeling dataen tilhører.

### Løsning
Legg til en avdelings-badge på tvers av de viktigste datavisningene. Badgen vises kun for brukere i et morselskap med `departmentsEnabled = true`.

### Teknisk tilnærming

**1. Hent avdelingsnavn sammen med data**

Alle steder som henter data med `company_id`, utvides med en join mot `companies`-tabellen for å hente `navn`:

- **`src/hooks/useOppdragData.ts`** (linje 89-91): Endre select til å inkludere `companies:company_id(id, navn)` i mission-queryen. Mapp `company_name` inn i hvert mission-objekt.

- **`src/components/dashboard/MissionsSection.tsx`** (linje 82-84): Samme — legg til `companies:company_id(id, navn)` i select.

- **`src/components/dashboard/IncidentsSection.tsx`**: Legg til `companies:company_id(id, navn)` i incidents-queryen.

- **`src/pages/Hendelser.tsx`**: Samme for hendelsessiden.

- **`src/pages/Documents.tsx`** / **`src/components/dashboard/DocumentSection.tsx`**: Legg til `companies:company_id(id, navn)` i dokumenthentingen.

**2. Vis avdelings-badge i UI**

- **`src/components/dashboard/MissionsSection.tsx`**: Vis en liten `Badge` med avdelingsnavnet under oppdragstittelen, kun når `departmentsEnabled && mission.company_id !== companyId`.

- **`src/components/oppdrag/MissionCard.tsx`**: Tilsvarende badge i oppdragskort-visningen.

- **`src/components/dashboard/IncidentsSection.tsx`**: Avdelings-badge på hendelseskort.

- **`src/components/documents/DocumentsList.tsx`**: Avdelings-kolonne/badge i dokumenttabellen (kun synlig for morselskap).

**3. Bruk `departmentsEnabled` og `companyId` fra AuthContext**

Sjekk `departmentsEnabled` fra `useAuth()`. Vis badge kun når:
- `departmentsEnabled === true`
- Elementets `company_id !== companyId` (dvs. det kommer fra en avdeling, ikke morselskapet selv)

Badgen viser avdelingsnavnet med en subtil styling (`variant="outline"` med en liten ikon).

### Filer som endres

| Fil | Endring |
|-----|---------|
| `src/hooks/useOppdragData.ts` | Join `companies(id, navn)` i mission-query, mapp til `company_name` |
| `src/components/dashboard/MissionsSection.tsx` | Join companies, vis avdelings-badge |
| `src/components/oppdrag/MissionCard.tsx` | Vis avdelings-badge |
| `src/components/dashboard/IncidentsSection.tsx` | Join companies, vis avdelings-badge |
| `src/pages/Hendelser.tsx` | Join companies i query |
| `src/components/dashboard/DocumentSection.tsx` | Legg til company_name i mapping |
| `src/components/documents/DocumentsList.tsx` | Vis avdelings-badge/kolonne |

### Visuell stil
Badge med `Building2`-ikon, `variant="outline"`, liten tekst — subtil men tydelig markering av avdelingstilhørighet.

