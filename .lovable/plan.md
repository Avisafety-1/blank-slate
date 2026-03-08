

## Plan: Fiks storage-sti for dokumentopplasting

### Problem
`DocumentUploadDialog.tsx` bruker `user.id` som første mappe i filstien, men storage RLS-policyen krever `company_id`. Dette betyr at alle ikke-superadmin-brukere får RLS violation ved opplasting.

### Endring

**`src/components/documents/DocumentUploadDialog.tsx`** — linje 105:
- Endre `const filePath = \`${user.id}/${Date.now()}.${fileExt}\`` til `const filePath = \`${companyId}/${Date.now()}.${fileExt}\``

Sjekk også andre steder som laster opp til `documents`-bøtten med feil sti:
- `CreateChecklistDialog.tsx` — verifiser at den bruker `companyId`
- `DocumentCardModal.tsx` — verifiser
- `FlightLogbookDialog.tsx` — verifiser
- `riskAssessmentPdfExport.ts` — verifiser

### Filer som endres
1. `src/components/documents/DocumentUploadDialog.tsx` — endre filsti fra `user.id` til `companyId`
2. Eventuelle andre filer med samme problem

