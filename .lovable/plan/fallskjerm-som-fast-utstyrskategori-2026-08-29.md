# Fallskjerm som fast utstyrskategori

## Mål
"Fallskjerm" skal være et fast valg i utstyrslisten (ved siden av Batteri, Radio, Kamera osv.), slik at risikovurderingen automatisk kan gi reduksjon i bakkerisiko (M2) når en fallskjerm er koblet til oppdraget — også i forhåndsvisningen før man kjører AI-risikovurderingen.

## Slik blir det
- Ny kategori "Fallskjerm" i nedtrekkslisten for utstyrstype, både når man oppretter og redigerer utstyr.
- Brukeren registrerer sin egen fallskjerm som en vanlig utstyrsrad (navn, serienummer, vedlikehold osv.) — hvert selskap får da sin egen rad i databasen, på samme måte som batterier.
- Kobles fallskjermen til et oppdrag, vises M2 "Impact reduction" som aktiv i forhåndsvisningen av automatiske SORA-tiltak, med robusthet Medium (eller High hvis beskrivelsen nevner DVR / design verification).
- Samme regel brukes av AI-risikovurderingen, så forhåndsvisning og ferdig rapport gir samme resultat.

## Om databasen
Utstyrskategoriene ligger som en fast liste i koden (ikke som egne rader), mens hvert enkelt utstyr er en rad i `equipment`-tabellen. Ingen migrasjon eller skjemaendring er nødvendig — "Fallskjerm" blir tilgjengelig som type, og radene opprettes av brukerne selv. Eksisterende egendefinerte typer påvirkes ikke.

## Teknisk
- `src/config/equipmentCategories.ts`: legg til `{ id: "Fallskjerm", label: "Fallskjerm" }`. Denne listen brukes av `useEquipmentTypes` og slås sammen med eksisterende typer i databasen.
- i18n: ny nøkkel `resources.equipmentTypes.Fallskjerm` i både `no.json` ("Fallskjerm") og `en.json` ("Parachute"), samt oppslag i `src/lib/i18nHelpers.ts`.
- Deteksjonen finnes allerede: `findParachuteEvidence` i `src/lib/soraAutoMitigations.ts` matcher `fallskjerm|parachute|dvr` mot navn/type/beskrivelse, og samme logikk ligger i `supabase/functions/ai-risk-assessment/index.ts`. Type-feltet "Fallskjerm" treffer dermed automatisk — ingen endring i utregningen.

## Verifisering
- Opprett utstyr med type "Fallskjerm", koble det til et oppdrag, åpne risikovurderingen: M2 vises som aktiv med -1 (Medium) i forhåndsvisningen før AI-kjøring, og samme reduksjon i den genererte rapporten.
