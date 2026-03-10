

## Fiks to problemer i DJI-import

### Problem 1: Flytur-valg vises ikke
Når SHA-256 duplicate-sjekken finner en match (linje 830), settes `matchedLog` direkte og funksjonen returnerer tidlig (`return`). Da kjøres aldri oppdrags-søket som populerer `matchCandidates`, og RadioGroup-listen over flyturer vises aldri.

**Løsning**: Når SHA-256-duplikat finnes, hent likevel alle flylogger for det matchede oppdraget og populer `matchCandidates`. Fjern `return` slik at brukeren kan se alle flyturer og velge. Pre-select den dupliserte loggen i stedet for å hardkode den.

**Endring i `findMatchingFlightLog`** (linje 822-834):
- Hvis duplikat finnes og den har en `mission_id`, hent alle flylogger for det oppdraget, sett `matchCandidates`, og pre-select duplikaten via `setMatchedLog`
- Hvis duplikaten har en mission, hent og sett `matchedMissions` og `selectedMissionId` også, slik at hele UI-flyten fungerer
- Fjern tidlig `return` — la resten av funksjonen håndtere oppdragssøk dersom duplikaten mangler mission

### Problem 2: «Drone auto-matchet via SN» vises ikke
Linje 1369 sjekker kun `selectedDrone?.serienummer === sn`, men `matchDroneFromResult` (linje 442-444) matcher også mot `internal_serial`. Hvis dronen ble matchet via `internal_serial`, vises ikke bekreftelsesteksten.

**Endring i UI** (linje 1369):
- Utvid sjekken til å også sammenligne mot `selectedDrone?.internal_serial`
- Slik at «Auto-matchet via SN» vises uansett om det var vanlig serienummer eller internt serienummer som matchet

### Oppsummering av filer
- `src/components/UploadDroneLogDialog.tsx`: To endringer — duplikat-logikk og SN-visningssjekk

