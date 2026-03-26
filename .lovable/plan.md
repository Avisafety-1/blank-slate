

## Analyse: Hvorfor «test» er synlig men «test2» ikke

### Funn fra databasen
Begge mappene er identiske i konfigurasjonen:
- **test** (`f322dd50`): `company_id = af43f04e`, `visible_to_children = true`
- **test2** (`b323fd6b`): `company_id = af43f04e`, `visible_to_children = true`

`can_read_folder`-funksjonen og alle RLS-policyer er korrekt satt opp. For avdelingsbrukeren (`contact@hh-vr.com`, company `5730368c`):
- `get_parent_company_id('5730368c')` returnerer `af43f04e` (riktig)
- Begge mapper matcher vilkåret `visible_to_children = true AND company_id = parent`

### Sannsynlig årsak
Session-replay viser at brukerens siste handling var en "Mappe slettet"-toast mens de var på Moderavdeling-kontoen. Det er mulig at:
1. Testen ble gjort før den siste migrasjonen (`20260326074033`) var ferdig deployet
2. React-query cachen viste foreldede data (queryKey er `["document-folders", companyId]`, som ikke invalideres automatisk ved selskapsbytte tilbake)

### Tiltak for å eliminere slike problemer

1. **Legg til `refetchOnWindowFocus: true`** i FolderGrid-queryen, slik at mapper alltid re-hentes når brukeren bytter tilbake til fanen/vinduet
2. **Invalidere folder-cachen ved selskapsbytte** — queryKey bruker `companyId`, men avdelingsbrukeren har alltid samme `companyId` (sin egen), så cachen oppdateres ikke selv om moderselskapet endrer deling
3. **Legg til en visuelt ikon** på delte mapper (som nyheter allerede har) for å tydeliggjøre at mappen kommer fra moderselskapet

### Konkret plan

**Fil: `src/components/documents/FolderGrid.tsx`**
- Legg til `refetchOnWindowFocus: true` og `staleTime: 0` for å sikre at mappedata alltid er fersk
- Inkluder `visible_to_children` og `company_id` i select-spørringen, slik at man kan vise et delingsikon for mapper som er arvet fra moderselskapet

Dette er en liten frontend-endring. Selve RLS-logikken er allerede korrekt — problemet er at gammel cache-data vises etter selskapsbytte eller migrasjonsdeployment.

### Tekniske detaljer
```text
Endring i FolderGrid.tsx queryFn:
- select("id, name") → select("id, name, company_id, visible_to_children")
- Legg til refetchOnWindowFocus: true, staleTime: 0
- Vis Building-ikon på mapper der company_id !== brukerens companyId
```

