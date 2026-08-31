# Ressurser fra avdelinger i hendelsesdialogen

## Problem
Når en hendelse opprettes fra et avvik, forhåndsvelges ikke dronen, og droner som tilhører en annen avdeling (f.eks. DJI FlyCart 100) mangler i listen. Årsaken er bekreftet:

- Hendelsesdialogen henter droner, utstyr og personell med `company_id = eget selskap`, så delte/avdelings-ressurser filtreres bort i frontend selv om databasen tillater å se dem (RLS gir tilgang via synlige selskaper + avdelingssynlighet).
- Fordi den forhåndsvalgte dronen ikke finnes i listen, vises «Ukjent drone» og valget ser tomt ut.
- Loggbokføring feiler for slike ressurser: INSERT-reglene på `drone_log_entries` og `equipment_log_entries` krever at raden lagres på brukerens eget selskap, mens ressursen tilhører en annen avdeling.

## Løsning

### 1. Vis alle synlige ressurser
- Fjern `company_id`-filteret i hendelsesdialogen for droner, utstyr og personell, og la databasens tilgangsregler bestemme hva som vises (inkluderer avdelingsdelte ressurser).
- Hent selskapsnavn og vis en liten avdelingsmerkelapp bak ressurser som tilhører en annen avdeling, slik at det er tydelig hvor de hører hjemme.
- Sørg for at forhåndsvalgt drone/utstyr fra oppdraget alltid vises korrekt (og at listene er lastet før forhåndsvalg vurderes), i stedet for «Ukjent drone».

### 2. Loggbøker på tvers av avdelinger
- Skriv loggboksoppføringen med ressursens eget `company_id` (dronens/utstyrets avdeling), ikke innlogget brukers selskap — da havner oppføringen i riktig loggbok.
- Databasemigrasjon: utvid INSERT-reglene på `drone_log_entries` og `equipment_log_entries` slik at godkjente brukere kan lagre oppføringer for et selskap de har innsyn i, og kun når selve dronen/utstyret er synlig for dem. Eget selskap fungerer som før; ingen andre tabeller eller regler endres.

## Teknisk
- `src/components/dashboard/AddIncidentDialog.tsx`: `fetchResourceData` uten `.eq("company_id", companyId)`, select utvides med `company_id, companies(navn)`; render av drone-/utstyrsliste får avdelingsbadge; `createLogbookEntries` slår opp ressursens `company_id` fra hentede lister.
- Migrasjon: erstatt INSERT-policyene «Approved users can create log entries in own company» (drone) og tilsvarende for utstyr med `company_id = ANY (get_user_visible_company_ids(auth.uid()))` + `EXISTS`-sjekk mot `drones`/`equipment` (som allerede er RLS-beskyttet) + fortsatt krav om godkjent profil.
- Nye strenger (avdelingsbadge) legges i både `no.json` og `en.json`.
