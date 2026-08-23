# Vis dronens «Navn» der droner listes opp

Feltet `dji_aircraft_name` (Navn) skal vises — men kun når det faktisk er satt. Er det tomt, endres ingenting i visningen.

## Hvor det vises

1. **Dronekortene på /ressurser** — navnet vises som en egen linje under modellen (f.eks. «Navn: Magic 3»).
2. **Status-dialogen på dashbordet** (Droner – Grønn/Gul/Rød) — samme linje, plassert ved SN.
3. **Dronevelgeren ved behandling av loggfil** — listeteksten blir `Modell – Navn (SN)` i stedet for `Modell (SN)`. Gjelder både enkeltbehandling og batch-panelet, og navnet gjøres søkbart i batch-panelets kombinasjonsboks.

## Teknisk

- `src/pages/Resources.tsx`: kortet henter allerede `*`, så `drone.dji_aircraft_name` er tilgjengelig; legg til en betinget linje i kortet (~linje 602).
- `src/components/dashboard/DroneListDialog.tsx`: betinget linje ved siden av «SN:» (~linje 83); kontroller at feltet er med i dataene som sendes inn, ellers legges det til i spørringen.
- `src/components/UploadDroneLogDialog.tsx`: felleshjelper for etiketten, brukt i begge `SelectItem`-listene (~linje 2439 og ~3118); spørringen henter allerede `dji_aircraft_name`.
- `src/components/upload/BatchLogPanel.tsx`: utvid `Drone`-interfacet med `dji_aircraft_name`, oppdater `label` og `search` (~linje 560), og sørg for at feltet følger med i dronelista som sendes inn.
- Nye i18n-nøkler for «Navn»-etiketten i både `no.json` og `en.json`. Ingen databaseendringer.
