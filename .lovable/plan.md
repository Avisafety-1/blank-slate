# Eierskap vs. synlighet på dokumenter (+ selskapsbadge)

## Hva jeg fant (verifisert mot databasen)

1. **Årsaken til at "Avdeling Bergen" står som eier:** databasefunksjonen `transfer_drone` gjør `UPDATE documents SET company_id = <ny avdeling>` når et dokument merkes som "flytt" under droneflytting. Det endrer det globale eierskapet til dokumentet — for alle som ser det — selv om dokumentet egentlig tilhører Avisafe. Det er feil: en flytting skal kun endre synlighet, ikke eierskap.

2. **Deling er implementert med for grove virkemidler.** I dag finnes bare to brytere: `visible_to_children` (kun direkte underavdelinger) og `global_visibility` (alle selskaper i hele plattformen). Fordi det ikke finnes noen "del med akkurat denne avdelingen", setter både `transfer_drone` og hjelpefunksjonen `grantMissingVisibility` `global_visibility = true` når mottakeren ikke er en direkte underavdeling. Det er derfor "Preflight drone" og "Before takeoff" nå er globalt synlige (verifisert: `global_visibility = true`, `company_id = Avdeling Bergen`).

3. **Manglende "Avisafe"-badge i Norconsult** skyldes navneoppslaget, ikke synligheten: dokumentlisten henter selskapsnavn via join mot `companies`, og RLS der tillater kun eget selskap, forelder og direkte barn. Navnet blir `null`, og badgen skjules. Superadmin ser alle selskaper og får derfor riktig badge.

4. **Synlighet følger allerede selskapet, ikke brukeren** — selskapsbytte oppdaterer `profiles.company_id`, som RLS-policyene bruker. Ingen endring nødvendig der.

5. **Rediger-dialogen** har kun bryteren "synlig for underavdelinger", og bare for morselskap. Det finnes ingen måte å se eller endre deling på en sjekkliste.

## Hva som skal gjøres

### 1. Skille eierskap fra synlighet (kjernen)
- Ny koblingstabell for dokumentdeling per avdeling (samme mønster som `equipment_department_visibility`): en rad per dokument + selskap som skal se det.
- SELECT-policyen på `documents` utvides slik at et dokument også er synlig for selskaper som står i denne tabellen.
- `transfer_drone` endres:
  - "del"-valget for dokumenter skriver en rad i den nye tabellen i stedet for å sette `visible_to_children`.
  - "flytt"-valget endrer kun `company_id` når dokumentet faktisk eies av avdelingen dronen flyttes *fra*. Eies dokumentet av et annet selskap (typisk moderselskapet), beholdes eierskapet og det deles i stedet.
- `grantMissingVisibility` slutter å sette `global_visibility`; den skriver rader i den nye tabellen for de avdelingene som mangler innsyn.
- `MoveDroneDialog` viser eier-selskap per dokument, og tilbyr ikke "flytt" for dokumenter eid av et annet selskap.

### 2. Rydde opp i eksisterende data
- Tilbakefør "Preflight drone" og "Before takeoff" til Avisafe som eier, skru av `global_visibility`, og legg inn eksplisitt deling med Avdeling Bergen slik at Bergen fortsatt ser dem.
- Gjennomgå øvrige dokumenter som tidligere transfers har satt `global_visibility = true` på (identifiseres via `drone_transfers.moved_resources`), og konverteres til eksplisitt deling der det er trygt. Dokumenter Avisafe med vilje deler globalt beholdes som globale.

### 3. Riktig selskapsbadge for delte dokumenter
- Ny SECURITY DEFINER-funksjon som returnerer `id` + `navn` for en liste selskaps-ID-er (kun navn, ingenting annet), tilgjengelig for innloggede brukere.
- Dokumentsiden bruker denne til å slå opp eiernavn i stedet for join-en som blokkeres av RLS.
- Resultat: dokumenter delt fra Avisafe får alltid "Avisafe"-badge, uansett hvilket selskap du står i.

### 4. Synlighetsseksjon i rediger-dialogen (også for sjekklister)
En egen "Synlighet"-boks i `DocumentCardModal`:
- Eierlinje: "Eies av <selskap>" (kun lesing).
- **Global deling** (kun superadmin): av/på for `global_visibility`.
- **Synlig for underavdelinger**: dagens bryter, flyttet inn i boksen.
- **Delt med avdelinger**: liste over avdelinger dokumentet er eksplisitt delt med, med mulighet til å legge til/fjerne (kun for eier-selskapets admin/superadmin).
- Vises for alle kategorier inkludert sjekklister, skjult i lesemodus.

### 5. i18n
Alle nye tekster som nøkler i både `no.json` og `en.json`.

## Teknisk

- Migrasjon 1: `document_department_visibility (id, document_id, company_id, created_at)`, unik på `(document_id, company_id)`, GRANT til `authenticated`/`service_role`, RLS med lesetilgang for synlige selskaper og skrivetilgang for eier-selskapets admin + superadmin. Ny SELECT-policy på `documents` for delte rader.
- Migrasjon 2: oppdatert `transfer_drone` (eierskapsvern + deling via ny tabell).
- Migrasjon 3: `get_company_names(_ids uuid[]) RETURNS TABLE(id uuid, navn text)`, `STABLE SECURITY DEFINER`, `SET search_path = public`, EXECUTE til `authenticated`.
- Dataopprydding kjøres som egne UPDATE/INSERT-setninger etter migrasjonene.
- Frontend: `src/pages/Documents.tsx` (navneoppslag), `DocumentsList.tsx` (badge får alltid navn), `DocumentCardModal.tsx` (synlighetsseksjon), `src/lib/droneVisibilityCheck.ts` (ingen `global_visibility`), `src/components/resources/MoveDroneDialog.tsx` (ingen "flytt" for fremmede dokumenter).
