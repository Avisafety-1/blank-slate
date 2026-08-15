# Justeringer på Avvik-fanen

## Om "Ny"-badgen (svar)

Badgen viser feltet `status` på avviket. Logikken i dag:

- **Ny** — standardverdien når piloten sender inn avviket etter flyturen. Ingen har behandlet det ennå.
- **Under behandling** — settes automatisk når noen trykker "Be pilot om hendelse", eller manuelt i Rediger-dialogen.
- **Lukket** — settes kun manuelt i Rediger-dialogen.

Det er altså en ren saksbehandlingsstatus, ikke tidsbasert (den blir ikke "gammel" av seg selv). Ingen endring foreslås her med mindre du ønsker det.

## Endringer

1. **Avvik-knappen får samme utseende som "Hendelser"**
   Knappen byttes ut med samme pille-element: samme ramme, avrunding, bakgrunnsglass og samme store, fete overskriftstekst. Aktiv fane får den fremhevede bakgrunnen, inaktiv fane den nøytrale — slik at de to fungerer som et likeverdig fanepar.

2. **Lenke til oppdraget i oppdrags-seksjonen**
   Oppdragstittelen på avvikskortet blir klikkbar (med lenke-ikon) og åpner oppdraget på /oppdrag i oppdragsdetaljene.

3. **Godkjenner vises**
   Hvis oppdraget er godkjent, vises "Godkjent av: <navn>" (med dato) i oppdrags-seksjonen på kortet. Vises kun når det finnes en godkjenner.

4. **Risikoscore-badge**
   Teksten i score-badgen endres fra farget til mørk/nøytral tekst, mens den fargede bakgrunnen (grønn/gul/rød etter score) beholdes.

5. **Fjerner det gule ikonet** ved siden av kategoritittelen (f.eks. "Klima").

## Teknisk

- `src/pages/Hendelser.tsx`: Avvik-knappen erstattes av samme `button`-pille som "Hendelser", med `t('deviations.title')` i samme typografi.
- `src/components/deviations/DeviationCard.tsx`: fjerner `FileWarning`-ikonet i headeren, gjør oppdragstittelen til en lenke (`/oppdrag?id=<mission_id>`), legger inn godkjenner-linje, og endrer `scoreTone` slik at tekstfargen bruker et nøytralt token med beholdt bakgrunnstint.
- `src/hooks/useDeviationReports.ts`: henter i tillegg `approved_by`, `approved_at` og `approval_status` fra `missions`, og slår opp godkjennerens navn i det eksisterende profil-oppslaget.
- Nye i18n-nøkler (`deviations.card.approvedBy`, `deviations.card.openMission`) legges til i både no.json og en.json.
