# Synlighet og selskapsbadge på dokumenter

## Hva jeg fant (verifisert mot databasen)

1. **Sjekklistene "Preflight drone" og "Before takeoff"** eies av *Avdeling Bergen* og har `global_visibility = true`. De er derfor synlige for **alle** selskaper, ikke bare din bruker. Badgen "Avdeling Bergen" er teknisk riktig (det er eier-selskapet), men delingen var trolig ikke tilsiktet — og det finnes ingen måte å skru den av på i dag.

2. **Manglende "Avisafe"-badge for gard@avisafe.no i Norconsult** skyldes ikke synlighetsregler, men navneoppslaget. Dokumentlisten henter selskapsnavn via `documents -> companies`, og RLS på `companies` tillater kun å lese eget selskap, forelder og direkte barn. Norconsult-brukere får derfor `null` som selskapsnavn for Avisafe-dokumenter, og badgen skjules (den vises kun når navnet finnes). Superadmin kan lese alle selskaper, derfor ser du badgen riktig.

3. **Synlighet følger allerede selskapet, ikke brukeren.** Bytte av selskap oppdaterer `profiles.company_id`, og RLS-policyene på `documents` bruker det. Ingen endring nødvendig her.

4. **Rediger-dialogen for dokumenter/sjekklister** viser kun bryteren "synlig for underavdelinger", og bare når du står i et morselskap. Det finnes ingen bryter for global deling, så en global sjekkliste kan ikke tas ned igjen fra grensesnittet.

## Hva som skal gjøres

### 1. Riktig selskapsbadge for delte dokumenter
- Ny SECURITY DEFINER-funksjon som returnerer `id` + `navn` for en liste selskaps-ID-er (kun navn, ingen andre felt), tilgjengelig for innloggede brukere.
- Dokumentsiden henter navn for alle selskaps-ID-er som forekommer i listen via denne funksjonen i stedet for join-en som blokkeres av RLS.
- Resultat: dokumenter delt fra Avisafe får alltid "Avisafe"-badge, uansett hvilket selskap du står i, og delte dokumenter fra andre selskaper får riktig eiernavn.

### 2. Synlighetsseksjon i rediger-dialogen (gjelder også sjekklister)
I `DocumentCardModal` legges en egen "Synlighet"-boks med:
- **Global deling** (kun superadmin): av/på for `global_visibility`, med forklaring om at dokumentet blir synlig for alle selskaper.
- **Synlig for underavdelinger**: dagens bryter, flyttes inn i samme boks (vises som i dag kun for morselskap).
- Kort statuslinje som forteller gjeldende tilstand, f.eks. "Delt globalt fra Avdeling Bergen".
- Boksen vises for alle kategorier, inkludert sjekklister, og er skjult i lesemodus.

Med dette kan du selv skru av global deling på de to Bergen-sjekklistene.

### 3. i18n
Alle nye tekster legges inn som nøkler i både `no.json` og `en.json`.

## Teknisk

- Migrasjon: `get_company_names(_ids uuid[]) RETURNS TABLE(id uuid, navn text)`, `STABLE SECURITY DEFINER`, `SET search_path = public`, `GRANT EXECUTE TO authenticated`. Eksponerer kun selskapsnavn.
- `src/pages/Documents.tsx`: erstatt `companies:company_id(id, navn)`-join med et oppslag mot funksjonen; `company_name` settes fra kartet.
- `src/components/documents/DocumentsList.tsx`: badge-betingelsen beholdes (`company_id !== aktivt selskap`), men får nå alltid et navn å vise.
- `src/components/documents/DocumentCardModal.tsx`: ny synlighetsseksjon, `global_visibility` med i lagringen (kun når superadmin).
- Ingen endringer i RLS-policyene på `documents` — de er allerede selskapsbaserte.
