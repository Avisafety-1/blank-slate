# Egendefinert drone lagres ikke i katalogen

## Hva som faktisk skjer

Selve dronen ble lagret, men den egendefinerte modellen ble aldri lagt inn i katalogen. Derfor finner kartet ingen tekniske data og viser "CD mangler".

Verifisert:
- Det finnes i dag **null** egne modeller i katalogen (alle 61 rader er globale).
- Katalogen krever en vekt (MTOM) for hver modell. Lagringen sender ingen vekt hvis feltet står tomt, og da blir raden avvist.
- Avvisningen skjer helt stille: feilen havner bare i nettleserloggen, og brukeren får beskjed om at dronen er lagret.
- De manuelle verdiene (CD, maks hastighet, IP osv.) lagres kun i katalogen — når katalograden feiler, forsvinner verdiene helt.

## Hva som fikses

1. **Lagringen feiler ikke lenger på manglende vekt.** Mangler MTOM, lagres modellen med vekt 0 i stedet for å bli avvist.
2. **Krev modellnavn + MTOM tydelig i skjemaet.** Er MTOM tom når man har valgt "angi manuelt", vises et hint om at vekt trengs for at modellen skal kunne gjenbrukes.
3. **Ingen stille feil.** Går lagringen av egen modell galt, får brukeren en tydelig feilmelding i stedet for en falsk suksessmelding.
4. **Modellisten oppdateres** etter at en ny egen modell er opprettet, slik at den umiddelbart dukker opp under "Egne droner".
5. **Etterkontroll i kartet:** når dronemodellen finnes i katalogen med CD, forsvinner "CD mangler" av seg selv (oppslaget prioriterer allerede selskapets egen modell).

Ingen databaseendringer er nødvendige.

## Teknisk

- `src/lib/customDroneModels.ts`: `upsertCompanyDroneModel` returnerer `{ id, error }` i stedet for bare `id | null`; `weight_kg` faller tilbake til `0`, `payload_kg` til `0`, `eu_class` til `""`; ilike-oppslaget escapes på `%`/`_` i navnet.
- `src/components/resources/AddDroneDialog.tsx`: leser returverdien, viser `toast.error` ved feil på egen modell (dronen lagres uansett), og refetcher `drone_models` etter vellykket upsert.
- `src/components/resources/DroneDetailDialog.tsx`: samme feilhåndtering ved lagring i manuell modus.
- `src/components/resources/DroneFormFields.tsx`: hint under MTOM når `isManualSpecs` og `vekt` er tom.
- i18n: nye nøkler `resourceDialogs.droneDetail.specs.weightRequiredHint` og `resourceDialogs.droneDetail.specs.saveModelFailed` i `no.json` og `en.json`.
- Valider med `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
