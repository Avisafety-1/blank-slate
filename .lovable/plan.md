

## Plan: Avdelingstilordning og brukeradministrasjon for moderselskap

### Oversikt
Moderselskapet skal kunne:
1. Velge avdeling når de sender invitasjon (avdelingens registreringskode brukes i e-posten)
2. Se og godkjenne brukere fra alle avdelinger (ikke bare eget selskap)
3. Flytte brukere mellom avdelinger
4. Avdelingsadministratorer skal **ikke** kunne endre avdelingstilhørighet

### Endringer

#### 1. Admin.tsx — Invitasjonsseksjonen
- Legg til en **avdelingsvelger** (Select/dropdown) ved siden av e-postfeltet i "Inviter ny bruker"-kortet
- Hent alle child companies for moderselskapet (allerede gjort i ChildCompaniesSection)
- Standardvalg: moderselskapet selv. Alternativer: alle avdelinger
- Når en avdeling er valgt, send avdelingens `registration_code` og `companyName` i invitasjons-e-posten i stedet for modersselskapets

#### 2. Admin.tsx — Brukerlisten (fetchData)
- Endre profilesQuery: i stedet for `.eq('company_id', companyId)`, hent brukere fra moderselskapet **og** alle child companies
- Fetch child company IDs først, deretter bruk `.in('company_id', [companyId, ...childIds])`
- Vis avdelingsnavn (fra `companies(navn)` join) som en Badge ved siden av brukerens navn

#### 3. Admin.tsx — Avdelingstilordning for godkjente brukere
- Legg til en **avdelingsvelger** per bruker i brukerlisten (kun synlig for moderselskapsadmin)
- Når avdeling endres, oppdater `profiles.company_id` til valgt avdelings company_id
- Denne velgeren skal **ikke** vises for administratorer som er i en avdeling (child company)

#### 4. Admin.tsx — Godkjenning av brukere fra avdelinger
- Moderselskapsadmin ser pending users fra alle avdelinger (takket være utvidet profilesQuery)
- Vis avdelingsnavn i pending-listen så admin vet hvilken avdeling brukeren registrerte seg til

#### 5. PendingApprovalsBadge.tsx
- Oppdater tellingen til å inkludere pending users fra child companies (for moderselskapsadmin)

#### 6. Ingen databaseendringer nødvendig
- `profiles.company_id` brukes allerede til å knytte bruker til selskap/avdeling
- Registreringskoden per avdeling eksisterer allerede (auto-generert ved opprettelse)
- RLS-endringen fra forrige migrasjon (`get_user_visible_company_ids`) gjør at moderselskapsadmin allerede kan lese profiler fra avdelinger

### Teknisk detalj — Skjule avdelingsbytte for avdelingsadministratorer
- `isChildCompany`-flagget (allerede implementert) brukes til å skjule avdelingsvelgeren
- Avdelingsadministratorer ser kun sine egne brukere og kan ikke endre `company_id`

