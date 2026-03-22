

## Plan: Moderselskap ser avdelingenes aktive flyvninger

### Problem
`ActiveFlightsSection` filtrerer på `company_id = companyId` for alle unntatt Avisafe-superadminer. Et morselskap ser derfor kun sine egne flygninger — ikke avdelingenes.

### Løsning
For administratorer i et morselskap (selskap med barn), bruk `in`-filter med alle synlige selskaps-IDer i stedet for `eq`.

### Endring — `ActiveFlightsSection.tsx`

1. Hent liste over child companies fra `companies`-tabellen der `parent_company_id = companyId`.
2. Hvis selskapet har barn: filtrer `active_flights` med `.in('company_id', [companyId, ...childIds])` i stedet for `.eq('company_id', companyId)`.
3. Vis selskapsnavn (`companyName`) på hvert flyv-kort når morselskapet ser avdelingers flygninger (samme mønster som allerede finnes for Avisafe-superadminer).