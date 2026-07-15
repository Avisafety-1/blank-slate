
# Søkbar oppdrag-dropdown i StartFlightDialog

Bytt ut den nåværende `Select`-en for oppdragsvalg (rundt linje 1062–1086 i `src/components/StartFlightDialog.tsx`) med en Popover + Command-basert combobox med søk og mobilvennlig linjebrytning. Alle andre `Select`-er i dialogen (f.eks. DroneTag) forblir uendret.

## Hva som skal endres

**Fil:** `src/components/StartFlightDialog.tsx` (kun oppdrag-dropdownen)

Erstatt `Select`-blokken for oppdragsvalg med:

- `Popover` + `PopoverTrigger` (en `Button variant="outline"` som viser valgt oppdrag eller placeholder).
- `Command shouldFilter={true}` inne i `PopoverContent` med:
  - `CommandInput` – søkefelt, `placeholder={t('flight.searchMission')}`.
  - `CommandList` – scrollbar.
  - `CommandEmpty` – `t('flight.noMissionsFound')`.
  - `CommandItem` for "Ingen oppdrag" (value="none").
  - `CommandItem` per oppdrag med `value={`${mission.tittel} ${mission.lokasjon}`}` slik at Command's innebygde fuzzy-søk matcher både tittel og lokasjon. `onSelect` setter `selectedMissionId`.

## Mobil-tilpasning (linjebrytning)

- Popover-innholdet: `className="w-[--radix-popover-trigger-width] p-0 max-w-[calc(100vw-2rem)]"` og `align="start"`, slik at bredden aldri overskrider skjermen.
- Hver rad bruker `flex items-start gap-2` (ikke `items-center`) og:
  - Tittel: `<span className="font-medium break-words">` .
  - Lokasjon: `<span className="text-xs text-muted-foreground break-words">` på egen linje under tittel på små skjermer via `flex-col sm:flex-row sm:items-center`.
- Trigger-knappen: `whitespace-normal text-left h-auto min-h-10 py-2` slik at lang valgt tekst brytes i stedet for å bli avkortet med "…".
- `CommandList` får `max-h-[50vh]` for at listen ikke sprenger mobilskjerm.

## Nye i18n-nøkler

Legg til i **BÅDE** `src/i18n/locales/no.json` og `src/i18n/locales/en.json`, under eksisterende `flight`-namespace:

- `flight.searchMission` – NO: `"Søk etter oppdrag..."` / EN: `"Search missions..."`
- `flight.noMissionsFound` – NO: `"Ingen oppdrag funnet"` / EN: `"No missions found"`

## Bevares uendret

- `data-tour="start-flight-mission"`-wrapperen (så guided tour fortsatt treffer).
- Auto-select/checklist/dronetag-logikken som lytter på `selectedMissionId`.
- MapPin-ikon foran oppdrag med rute.
- "Ingen oppdrag"-alternativet øverst.

## Utenfor scope

- Ingen refaktorering av datahenting eller andre `Select`-er.
- Ingen endring på desktop-layout ut over at raden nå bryter pent.
- Ingen ny paginering/lazy-load – lista er allerede begrenset til de siste 20 oppdragene i eksisterende query.

## Verifisering

- Åpne StartFlightDialog på mobil-viewport (390×844): trigger-tekst brytes, popover er ≤ skjermbredde, lange oppdragsnavn/adresser wrappes.
- Skriv i søkefeltet: listen filtreres på tittel og lokasjon.
- Velg oppdrag: valgt tekst vises i trigger, checklist/dronetag-effektene kjører som før.
- Bytt språk til engelsk: nye strenger vises på engelsk.
