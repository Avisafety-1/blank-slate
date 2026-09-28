# NOTAM-generator: konsistente tidspunkter

## Problem
NOTAM-teksten viser to motstridende tidspunkter:
- Første linje bruker klokkeslett-feltene (`timeFrom`/`timeTo`), f.eks. `TUE 0800-1600`.
- `FROM:`/`TO:`-linjen bruker tidspunktene arvet fra oppdragets `tidspunkt`/`slutt_tidspunkt`, f.eks. `07:00 TO 11:00`.

Datovelgeren har ikke klokkeslett, så det arvede tidspunktet er usynlig for brukeren.

## Løsning (valgt: bruk klokkeslett-feltene)
Klokkeslett-feltene blir eneste sannhetskilde for tidspunkter i NOTAM-teksten.

Endringer i `src/components/dashboard/NotamDialog.tsx`:

1. **Forhåndsutfylling fra oppdrag:** når dialogen åpnes med et oppdrag, settes `timeFrom`/`timeTo` fra oppdragets `tidspunkt`/`slutt_tidspunkt` (lokal tid, format `HHmm`), i stedet for standard `0800`. Brukeren kan fortsatt overstyre.
2. **FROM/TO bygges fra dato + klokkeslett:** `FROM:` bruker `startDate` med klokkeslettet fra `timeFrom`, `TO:` bruker `endDate` med klokkeslettet fra `timeTo`. Tidspunktet på selve dato-objektet ignoreres. Klokkeslett tolkes som lokal tid og konverteres til UTC i teksten (NOTAM bruker UTC), med UTC-merking i linjen.
3. **Lagring:** `notam_start_utc`/`notam_end_utc` lagres med samme kombinerte dato+klokkeslett, slik at lagrede verdier samsvarer med den genererte teksten.
4. **Validering:** klokkeslett-feltene valideres som `HHmm` (4 siffer); ugyldig input gir en tydelig feilmelding i stedet for en NOTAM med feil tid.

## Teknisk
- Kun `src/components/dashboard/NotamDialog.tsx` endres; ingen databaseendringer.
- Nye tekstnøkler (feilmelding, UTC-merking) legges i både `no.json` og `en.json`.
- Hjelpere: `parseHhmm(timeFrom)` → `{h, m}` eller null; `combineDateTime(date, hhmm)` → Date i lokal tid; FROM/TO formateres med `getUTC*`-metoder som i dag.

## Kontroll
- Åpne NOTAM-dialogen fra et oppdrag 07:00–11:00: klokkeslett forhåndsutfylles til 0700/1100, og første linje og FROM/TO viser samme tid.
- Endre klokkeslett til 0800–1600: begge linjene oppdateres likt.
- Test med datoer på begge sider av midnatt og sommertid (UTC+2).
- `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
