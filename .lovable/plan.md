
# Fiks: profil-dialogen sklir utenfor mobilskjermen

Bekreftet at det er kurs-kortene i `PersonCompetencyDialog` ("Tilgjengelige kurs") som tvinger horisontal overflow på mobil. Den ytre flex-containeren mangler `min-w-0`, så `truncate` på tittel/beskrivelse slår ikke inn og kortet vokser med innholdet.

## Endringer

**`src/components/resources/PersonCompetencyDialog.tsx`** (kurs-kortet rundt linje 770):
- Legg til `min-w-0 max-w-full overflow-hidden` på den ytre flex-containeren slik at barna kan krympe.
- Endre `gap-3` → `gap-2 sm:gap-3` for å gi knappen mer plass på små skjermer.
- Legg til `shrink-0` på "Ta kurs"-knappen så den ikke klemmes.
- Legg til `truncate` på "Bestått: …"-linjen og `break-words` på beskrivelsen som sikkerhetsnett.

## Ikke berørt
- Eksisterende kompetanse-kort, FlightKpi og dialogens øvrige struktur. Kun kurs-kortets bredde-håndtering rettes.
