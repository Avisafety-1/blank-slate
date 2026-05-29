## Mål
Når en bruker sender tilbakemelding via "Gi tilbakemelding" i profilmenyen, skal e-posten til support inneholde:
- Hvilket selskap/avdeling brukeren tilhører
- Et valgfritt oppdrag som referanse (valgt fra dropdown)

## Endringer

### 1. `src/components/ProfileDialog.tsx` — Feedback-dialogen
- Legg til ny state `feedbackMissionId` (string | undefined).
- Hent brukerens oppdrag når dialogen åpnes: spørring mot `missions` filtrert på brukerens `company_id`, sortert på `planned_start` desc, begrenset til de siste ~50. Vises kun for valg, ingen RLS-endringer (eksisterende policies tillater allerede tilgang).
- Ny `Select`-kontroll i dialogen, plassert mellom "Melding" og bildevedlegg, med label "Oppdrag (valgfritt)" og placeholder "Ingen". Hvert item viser oppdragsnavn + dato.
- Send `missionId` med i `supabase.functions.invoke('send-feedback', { body: {..., missionId } })`.
- Nullstill `feedbackMissionId` ved lukking/sending, samme mønster som de andre feltene.

### 2. `supabase/functions/send-feedback/index.ts` — E-postinnhold
- Utvid `profiles`-select til også å hente selskapets navn via join: `company:companies(name, parent_company_id, parent:companies!parent_company_id(name))` slik at vi får både avdelingsnavn og evt. morsselskap.
- Hvis `missionId` er sendt med: hent `id, name, planned_start, location_name` fra `missions` med service-client (begrenset til samme `company_id` som brukerens profil for sikkerhet).
- Bygg ut HTML-malen med to nye linjer rett under "Fra:":
  - `Selskap/avdeling:` viser "Morsselskap › Avdeling" hvis parent finnes, ellers bare selskapsnavn.
  - `Oppdrag:` viser oppdragsnavn + dato hvis valgt, ellers utelates linjen.

## Tekniske detaljer
- Ingen DB-migrasjoner, ingen nye policies — bruker eksisterende `missions`/`companies` lesetilgang.
- Mission-listen i klienten cacches i lokal state, hentes lazy første gang dialogen åpnes (unngår unødvendig query ved hver innlogging).
- Edge-funksjonen validerer at valgt mission tilhører brukerens `company_id` før den tas med i e-posten (forhindrer at en manipulert klient inkluderer fremmede oppdragsnavn i mailen).
