# Slett flytur fra oppdragskortet

## Mål
Under "Flyturer" på oppdragskortet skal hver flytur vise piloten, og få en "Slett"-knapp som med bekreftelse fjerner flyturen og tilhørende loggbokoppføringer.

## Vis pilot
Flyturene hentes i dag uten personell, derfor står det ingen pilot. Utvid uthentingen av flyturer så koblet personell (`flight_log_personnel` → `profiles.full_name`) blir med, og vis navnet på flyturlinja (fallback: "Ukjent pilot").

## Slett-knapp
Ny "Slett"-knapp ved siden av Analyser / GPX / KMZ, i rød/destruktiv stil.

Bekreftelsesdialog som forklarer at følgende slettes:
- selve flyturen
- oppføringen i pilotens loggbok
- oppføringen i dronens (og evt. utstyrets) loggbok
- flytimene som flyturen bidro med, trekkes fra drone, utstyr og pilot

Teksten viser dato, varighet, drone og pilot for flyturen som slettes.

## Hva slettes teknisk
1. Trekk fra flytimer på drone og eventuelt tilknyttet utstyr (databasen har bare trigger for pålegging ved ny flytur, ikke for sletting) — pilotens timer beregnes automatisk på nytt av databasen.
2. Slett tilhørende `personnel_log_entries` som peker på flyturen (`flight_log_id`).
3. Slett relaterte drone-/utstyrsloggoppføringer som ble opprettet for denne flyturen (matches på ressurs + tidspunkt/tittel fra flyturen).
4. Slett `flight_logs`-raden; koblingstabeller (`flight_log_personnel`, `flight_log_equipment`, `flight_events`) fjernes via cascade.
5. Feiler slettingen (f.eks. blokkert av tilgangsregler), vises en feilmelding og ingenting annet slettes.

Etter sletting oppdateres oppdragslista, drone-/utstyrsstatus og profildata automatisk.

## Tilgang
Knappen vises for brukere som allerede kan redigere flyturen (eier av flyturen, admin/operativ leder, superadmin) — samme regler som ellers i appen.

## i18n
Alle nye tekster (knapp, dialogtittel, forklaring, feil-/suksessmeldinger, "Ukjent pilot") legges inn i både `no.json` og `en.json`.

## Filer som endres
- `src/hooks/useOppdragData.ts` — hent pilot til flyturene
- `src/components/oppdrag/MissionCard.tsx` — pilotvisning, slett-knapp, bekreftelsesdialog
- ny hjelpefunksjon for sletting (f.eks. `src/lib/flightLogDeletion.ts`) slik at logikken kan gjenbrukes
- `src/i18n/locales/no.json`, `src/i18n/locales/en.json`
