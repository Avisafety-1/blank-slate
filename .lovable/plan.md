## Diagnose

Tilbakemeldingen beskriver to symptomer, men de har samme rotårsak.

**Hvordan sjekklister lagres**
I `documents`-tabellen brukes raden `beskrivelse` (TEXT) til å lagre selve sjekkliste-punktene som JSON når `kategori = "sjekklister"`. UI har en egen tilstand `checklistItems`, og rett før innsending konverteres listen til `JSON.stringify(validItems)` og skrives til `beskrivelse` (`DocumentCardModal.tsx` linje 296–300).

**Bug 1 – "Maks 1000 tegn" som ikke forsvinner**
Skjemaets Zod-schema (`DocumentCardModal.tsx` linje 87) krever `beskrivelse.max(1000)`. Når dokumentet lastes inn, fyller `form.reset` `beskrivelse` med den eksisterende JSON-strengen (linje 229). For en sjekkliste med mange punkter overstiger denne JSON-en lett 1000 tegn, og Zod stopper innsendingen **før** `onSubmit` får serialisert den nye listen. Når brukeren tømmer punktene i UI-et, oppdateres bare `checklistItems`-staten – form-feltet `beskrivelse` holder fortsatt den gamle JSON-en, så feilmeldingen forblir. Resultat: ingen oppdatering kan lagres.

**Bug 2 – "Oppdatert sjekkliste synkroniseres ikke"**
`ChecklistExecutionDialog` henter sjekklisten ferskt fra `documents` hver gang dialogen åpnes (ingen cache, ingen snapshot på oppdrag) – `useChecklists` returnerer bare id/tittel. Det er altså ingen reell synk-bug i pilot-flyten. Symptomet skyldes Bug 1: admin tror endringene lagres, men Zod blokkerer dem, så piloter ser fortsatt forrige versjon.

## Fiks

Endre **`src/components/documents/DocumentCardModal.tsx`**:

1. **Conditional schema for `beskrivelse`.** Bytt det statiske `formSchema` med en `z.discriminatedUnion`/`superRefine` slik at:
   - `kategori !== "sjekklister"`: behold `beskrivelse.max(1000)`.
   - `kategori === "sjekklister"`: tillat større tekst (sett øvre grense til f.eks. 100 000 tegn for å hindre misbruk) – feltet inneholder maskingenerert JSON og skal aldri vises som fritekst.

2. **Hold form-feltet i synk med UI-staten.** I `handleAddChecklistItem`, `handleRemoveChecklistItem`, `handleMoveChecklistItem` og `handleChecklistItemChange`: etter `setChecklistItems` kall `form.setValue("beskrivelse", JSON.stringify(nextItems), { shouldValidate: true })`. Dette gjør at gammel JSON ikke ligger igjen i feltet, og at valideringsfeil som måtte oppstå tilbakestilles umiddelbart når brukeren rydder.

3. **Beskytt mot stale state ved kategori-bytte.** Når `kategori` byttes til/fra `sjekklister`, nullstill `beskrivelse` i form (allerede delvis dekket av `form.reset`, men sikre det i `kategori` `onChange`).

## Verifisering

- Åpne en eksisterende sjekkliste med >10 punkter, slett ett punkt, lagre → skal lagre uten "maks 1000 tegn"-feil.
- Legg til 50 punkter, lagre → skal lagre.
- Åpne `StartFlightDialog` som pilot etter at admin har lagret en endring → ny versjon vises (allerede ferskhentet, ingen kodeendring nødvendig der).
- Endre kategori fra "sjekklister" til "annet" og tilbake → ingen falsk valideringsfeil.

## Tekniske detaljer

- Ingen DB-migrasjon nødvendig (`beskrivelse` er allerede TEXT uten lengdebegrensning på DB-siden).
- Ingen endringer i `ChecklistExecutionDialog`, `useChecklists` eller `StartFlightDialog`.
- Påvirker kun `src/components/documents/DocumentCardModal.tsx`.
