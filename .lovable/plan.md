# Gjennomgang: rollen «bruker» vs «administrator»

## Svar kort

Innenfor egen avdeling er det **ingen forskjell** på hva en «bruker» og en «administrator» får **se**. All lesetilgang til dokumenter, droner, utstyr, oppdrag, flygninger, vedlikehold, personell, sjekklister, mapper og filer er styrt av hvilket selskap raden tilhører – ikke av rolle.

Forskjellene ligger to andre steder:

1. **Avdelinger under egen avdeling:** en administrator ser også alt i underavdelingene. En «bruker» ser kun sin egen avdeling. Det gjelder droner, utstyr, oppdrag, flygninger, mapper, personell osv.
2. **Endring/sletting:** en «bruker» kan endre og slette det hun selv har opprettet; administratorer har i tillegg noen regler for hele avdelingen.

Dokumenter fra moderavdelingen er unntaket: de vises for alle – også vanlige brukere – når «del med underavdelinger» er på, når dokumentet er delt eksplisitt med avdelingen, eller når det er globalt. Selve filnedlastingen følger samme regel, så vanlige brukere får åpnet dem.

## Tre svakheter funnet i gjennomgangen

### 1. Rollenavnet «admin» finnes i regler, men ingen har den rollen
Alle konti i systemet har «bruker», «administrator» eller «superadmin». Ingen har «admin». Flere tilgangsregler er likevel skrevet for «admin», og er derfor døde:

- Administratorer kan ikke endre eller slette droner og utstyr som andre har opprettet (bare de de selv opprettet, eller der de står som teknisk ansvarlig).
- Administratorer kan ikke endre eller slette hendelsesrapporter andre har opprettet.
- Administratorer kan ikke rette eller slette loggbokføringer, flygninger eller flygningens personell/utstyr som andre har lagt inn.
- Administratorer ser ikke oversikt over roller, e-postmaler, e-postinnstillinger og enkelte integrasjonslogger som er ment for dem.

### 2. Mapper deles ikke per avdeling
Et enkeltdokument kan deles eksplisitt med en avdeling. Det kan ikke en mappe. Ligger dokumentet i en mappe som tilhører en annen avdeling, ser mottakeren dokumentet i listen, men ikke mappen det ligger i.

### 3. Vanlige brukere i moderavdelingen
En «bruker» som står i moderavdelingen ser ikke data fra underavdelingene. Det er sannsynligvis riktig, men verdt å bekrefte.

## Foreslått opprydding

1. Migrasjon som utvider alle tilgangsregler som i dag nevner rollen «admin» til også å gjelde «administrator». Reglene utvides – ingen mister tilgang, og vanlige brukere får ingen nye rettigheter.
2. Etterpå: kjør sikkerhetsskanneren og bekreft at ingen nye advarsler dukker opp.
3. Punkt 2 (mappedeling) og punkt 3 (brukere i moderavdeling) holdes utenfor denne runden – de er produktvalg, ikke feil.

## Teknisk

- `get_user_visible_company_ids(uid)` returnerer eget selskap + barn for rollene `administrator`/`admin`/`superadmin`, ellers kun eget selskap. Dette er den eneste rolleavhengigheten i lesetilgang.
- `documents` SELECT: eget/synlige selskap, `visible_to_children` fra mor, `document_is_shared_with_user`, `global_visibility` – helt rollefri.
- `storage.objects` SELECT for bucket `documents`: mappenavn i synlige selskap, global, visible_to_children eller `can_read_document_file(name)` – også rollefri.
- Politikker som må utvides fra `has_role(uid,'admin')` til også `'administrator'`: på `drones`, `equipment`, `incidents`, `missions`, `drone_log_entries`, `equipment_log_entries`, `flight_logs`, `flight_log_personnel`, `flight_log_equipment`, `mission_drones`, `mission_personnel`, `mission_equipment`, `user_roles` (SELECT), `email_templates`, `email_settings`, `eccairs_exports`, `eccairs_integrations`, `dji_sync_jobs`, `ardupilot_parse_jobs`, `bulk_email_campaigns`, `fh2_*`, `mcp_write_audit`, `mission_approval_reminders`, `inspection_packages`, `evaluation_responses`, `internal_messages`, `weekly_report_sends`.
- Full liste hentes i migrasjonen ved å gå gjennom `pg_policies` der uttrykket inneholder `'admin'::app_role`, og hver policy skrives om eksplisitt (ingen dynamisk SQL).
