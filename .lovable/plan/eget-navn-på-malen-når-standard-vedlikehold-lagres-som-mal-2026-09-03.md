# Eget navn på malen når standard vedlikehold lagres som mal

I dag er navnefeltet låst til "Standard vedlikehold" når man redigerer standard vedlikehold, og "Lagre som mal" bruker akkurat det navnet. Resultatet er flere maler som alle heter "Standard vedlikehold" og ikke går an å skille fra hverandre (som i skjermbildet).

## Slik blir det

- "Lagre som mal" åpner et lite navnevindu der man skriver inn malnavnet før den lagres (forslag forhåndsutfylt: ressursens navn + "vedlikehold", ellers gjeldende navn).
- Selve vedlikeholdet heter fortsatt "Standard vedlikehold" — bare malen får det nye navnet.
- Tomt navn blokkeres, og hvis en mal med samme navn allerede finnes får man beskjed om å velge et annet navn.
- Samme navnevindu brukes for egendefinerte inspeksjoner, med inspeksjonens navn forhåndsutfylt, så flyten er lik overalt.
- Etter lagring oppdateres nedtrekket "Bruk lagret mal" med det nye navnet.

## Teknisk

- Ingen databaseendringer. `maintenance_schedule_presets.navn` brukes som i dag.
- I `src/components/resources/MaintenanceSchedulesSection.tsx`: `saveAsPreset` tar imot et malnavn fra en ny liten navne-dialog (state `presetNameOpen` / `presetName`) i stedet for å lese `form.navn`. Duplikatsjekk gjøres mot allerede innlastede `presets`.
- Nye tekster (`presetNameTitle`, `presetNameLabel`, `presetNameDuplicate`, m.fl.) legges i både `no.json` og `en.json`.
