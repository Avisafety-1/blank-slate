## Mål

Legge til en «Finner du ikke oppdraget ditt?» / «Ikke riktig oppdrag?»-knapp i `UploadDroneLogDialog`, slik at brukeren alltid kan søke opp og velge et oppdrag manuelt — uavhengig av om auto-matchingen fant noe, fant feil oppdrag, eller ikke fant noe.

## Hvor

Filen `src/components/UploadDroneLogDialog.tsx`, i området rundt linje 2777–2870 hvor matchede oppdrag (`matchedMissions`) og «ingen match»-meldingen vises.

## UI-flyt

1. **Når auto-match finner oppdrag** (`matchedMissions.length > 0`): Under radio-listen vises en liten lenke-knapp:
   > «Ikke riktig oppdrag? Søk etter et annet oppdrag»

2. **Når ingen match** (`matchedMissions.length === 0`): I den blå info-boksen («Ingen eksisterende oppdrag matcher…») vises i tillegg knapp:
   > «Finner du ikke oppdraget ditt? Søk i alle oppdrag»

3. Klikk åpner en `Popover` med `Command`/`CommandInput`/`CommandList` (samme mønster som andre søkbare velgere i prosjektet, f.eks. `SearchablePersonSelect`):
   - Søker i selskapets oppdrag (samme `companyId`-scope som auto-matchen bruker).
   - Viser tittel, dato (`tidspunkt`), lokasjon og status.
   - Default sortert etter dato desc; filtrerer på fritekst i tittel/lokasjon/kunde.
   - Begrens til siste ~200 (ev. paginert «vis flere» hvis trengs senere — start enkelt).

4. Når brukeren velger et oppdrag fra søket:
   - Hvis det ikke allerede er i `matchedMissions`, legges det til i listen og blir automatisk valgt (`setSelectedMissionId(m.id)`).
   - Eksisterende «Eksisterende flyturer for valgt pilot…»-blokk (linje 2809) fungerer da uendret, fordi den henter data via `selectedMissionId`.
   - Vi henter også eksisterende `flight_logs` for det valgte oppdraget og legger inn i `matchCandidates` (samme mønster som i auto-match-blokken rundt linje 1362–1373), slik at duplikat-visning og «oppdater eksisterende flytur» fortsatt fungerer.

## Tekniske detaljer

- Ny lokal state: `manualPickerOpen: boolean`, `manualSearch: string`, `manualResults: Mission[]`, `manualLoading: boolean`.
- Ny funksjon `searchMissions(q)`:
  ```ts
  supabase.from('missions')
    .select('id, tittel, tidspunkt, lokasjon, status, kunde')
    .eq('company_id', companyId)
    .or(`tittel.ilike.%${q}%,lokasjon.ilike.%${q}%,kunde.ilike.%${q}%`)
    .order('tidspunkt', { ascending: false })
    .limit(50);
  ```
  Hvis `q` er tom: hent siste 50 uten `.or`. Debounce 250 ms.
- Ny funksjon `handleManualMissionSelect(mission)`:
  1. `setMatchedMissions(prev => prev.find(x => x.id === mission.id) ? prev : [mission, ...prev])`
  2. `setSelectedMissionId(mission.id)`
  3. `setMatchedLog(null); setSelectedFlightLogChoice('')`
  4. Hent eksisterende flight_logs for oppdraget og merge inn i `matchCandidates` (filter ut duplikater på `id`).
  5. Lukk popover.
- Bruker eksisterende komponenter: `Popover`, `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandItem`, `Button`. Ingen nye dependencies.

## Stil

- Lenke-knappen: `variant="link"` eller `variant="ghost"` med `size="sm"`, ikon `Search`. Norsk tekst, lavmælt — ikke konkurrer med radio-valgene.
- Popover-innhold: `w-[360px] p-0`, samme glassmorphism som ellers (default popover-styling holder).
- Resultatrad: tittel fet, dato/lokasjon i `text-muted-foreground text-xs`, status-badge til høyre.

## Ikke i scope

- Endringer i auto-match-logikk eller edge functions.
- Paginering ut over første 50 treff (kan utvides senere ved behov).
- Manuelt valg fra ekspandert split-view-listen i `PendingDjiLogsSection` (samme dialog brukes når man klikker en pending-log, så endringen dekker også den flyten automatisk).
