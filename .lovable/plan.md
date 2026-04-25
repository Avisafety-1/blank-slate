Plan for å rette UA size i tilstøtende områder når drone er valgt

1. Utvid dronemodell-katalogen
- Legg til felt i `drone_models` for:
  - `characteristic_dimension_m` (CD/største relevante dimensjon i meter)
  - eventuelt `max_speed_mps` hvis vi vil slutte å estimere V0 fra maks vind.
- Oppdater eksisterende katalograder med realistiske CD-verdier for alle modeller som finnes i katalogen, inkludert FlyCart 100.
- FlyCart 100 skal ikke falle tilbake til CD=1.0 m; den skal få en CD over 3 m slik at UA size blir minst `< 8 m UA`, forutsatt at V0 fortsatt er under 75 m/s.

2. Bruk katalogverdier automatisk i SORA-panelet
- Oppdater `SoraSettingsPanel` slik at valg av drone henter `characteristic_dimension_m` og `max_speed_mps` fra `drone_models`.
- Når drone velges, fylles CD-feltet automatisk fra katalogen hvis brukeren ikke allerede har overstyrt manuelt.
- Sett `settings.characteristicDimensionM` og `settings.groundSpeedMps` samtidig, slik at `AdjacentAreaPanel` får riktige verdier uten at brukeren må trykke «Bruk SORA 2.5-beregning» først.
- Behold manuell overstyring: brukeren kan fortsatt endre CD/V0 direkte for oppdraget.

3. Rett matching mot katalogen
- Dagens kode bruker delvis eksakt `ilike(name, selectedDrone.modell)` og delvis `%modell%`. Jeg vil gjøre matching mer robust, slik at droner i flåten med navn som «DJI FlyCart 100», «FlyCart 100» eller varianter med serienavn finner riktig katalograd.
- Sikre at både kart-siden og SORA-panelet bruker samme logikk for katalogoppslag.

4. Vis tydelig kilde i UI
- I SORA-panelet viser vi at CD/V0 kommer fra «Dronemodell-katalog» når automatisk utfylt.
- Hvis katalogen mangler CD for en modell, vis en liten advarsel om at systemet bruker fallback, slik at feil UA size ikke skjules.

5. Verifisering
- Test at `deriveUaSizeFromSora()` gir riktig UA-kategori for typiske modeller:
  - små droner: `< 1 m` eller `< 3 m` avhengig av CD/V0
  - Matrice 300/350/400: forventet større kategori basert på CD
  - FlyCart 100: ikke `< 3 m`; forventet `< 8 m UA` dersom CD < 8 m og V0 < 75 m/s
- Test flyten på `/kart`: velg FlyCart 100 i SORA-panelet, åpne tilstøtende område og bekreft at UA size følger katalogens CD.

Tekniske detaljer
- Databaseendring krever migrasjon på `public.drone_models`.
- Frontend endres primært i:
  - `src/components/SoraSettingsPanel.tsx`
  - `src/pages/Kart.tsx`
  - eventuelt en liten helper i `src/lib/` for katalogmatching/UA-spesifikasjoner.
- `src/integrations/supabase/types.ts` skal ikke redigeres manuelt.