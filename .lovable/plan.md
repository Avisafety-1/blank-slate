# Egne dronemodeller i katalogen

## Hva du får
- I «Legg til drone» velger du fortsatt fra dronekatalogen eller «Angi manuelt». Velger du «Angi manuelt», får du fylle inn tekniske spesifikasjoner selv.
- Når dronen lagres, opprettes modellen som en **egen dronemodell** i katalogen, i en egen gruppe «Egne droner» øverst i nedtrekkslisten — adskilt fra de globale modellene.
- Egne modeller er kun synlige for selskapet de opprettes i, inkludert underavdelingene. Ingen andre selskaper ser dem.
- Neste gang noen i selskapet legger til samme dronetype, velger de bare den egne modellen og får spesifikasjonene automatisk.

## Felter under «Tekniske spesifikasjoner»
I opprett-/rediger-dialogen utvides den eksisterende seksjonen «TEKNISKE SPESIFIKASJONER» (der Vekt MTOM og Payload ligger i dag) med:

- Karakteristisk dimensjon (CD) i meter
- Maks hastighet (m/s)
- Maks vind (m/s)
- Flytid (minutter)
- IP-rating (tom = «Ikke dokumentert»)
- Type: multirotor eller fastvinge

Feltene er redigerbare kun i «Angi manuelt»-modus. Velger du en katalogmodell, fylles feltene av katalogen og vises som i dag.

## Dronekortet
Kortet henter allerede spesifikasjoner fra katalogen, så egne modeller vises der uten endringer. To verdier mangler i visningen i dag og legges til: **CD** og **maks hastighet**.

## Bruk i beregninger
Egne modeller behandles nøyaktig som katalogmodeller: CD og hastighet inn i SORA-buffere og ALOS, IP-rating vurderes mot nedbør i risikovurderingen (advarsel, aldri hard stop), maks vind og type inn i SORA-forslag.

## Teknisk

Databaseendring (legges fram for din godkjenning før den kjøres):
- `public.drone_models`: nye kolonner `company_id uuid references public.companies(id) on delete cascade` (NULL = global katalog), `created_by uuid`, `airframe_category text`. Indeks på `company_id`.
- Erstatt dagens policy «Authenticated users can read drone models» (`USING (true)`) med:
  - SELECT: `company_id IS NULL OR company_id = ANY (public.get_user_visible_company_ids(auth.uid()))` — bruker eksisterende hierarkifunksjon, så underavdelinger ser morselskapets egne modeller.
  - INSERT/UPDATE/DELETE for `authenticated`: kun rader der `company_id` er blant brukerens synlige selskaper og `company_id IS NOT NULL` (globale modeller forblir skrivebeskyttet).
  - `GRANT SELECT, INSERT, UPDATE, DELETE ON public.drone_models TO authenticated;` og `GRANT ALL ... TO service_role;`
- Ingen endring i `public.drones` — spesifikasjonene bor i katalogen.

Frontend:
- `DroneFormFields.tsx`: utvid `DroneFormValues` med `characteristic_dimension_m`, `max_speed_mps`, `max_wind_mps`, `endurance_min`, `ip_rating`, `airframe_category`; legg feltene i «Tekniske spesifikasjoner»-blokken; disable dem når `selectedModelId !== "manual"`. Nedtrekkslisten grupperes med `SelectGroup`/`SelectLabel`: «Egne droner» (rader med `company_id`) og «Katalog».
- `AddDroneDialog.tsx`: ved manuell modus opprettes først en rad i `drone_models` (`company_id` = brukerens selskap, `name` = `values.modell`, `eu_class` = valgt klasse, vekt/payload/spesifikasjoner fra skjemaet), deretter dronen. Duplikatnavn innen samme selskap gjenbruker eksisterende rad i stedet for å opprette ny.
- `DroneDetailDialog.tsx`: samme felt i redigering for droner knyttet til en egen modell (oppdaterer modellraden); katalogoppslaget (linje ~423) filtrerer allerede via RLS. Legg til CD og maks hastighet i spesifikasjonsboksen.
- `SoraSettingsPanel.tsx` og `supabase/functions/ai-risk-assessment/index.ts` trenger ingen logikkendring — de slår opp `drone_models` på navn og treffer nå også egne modeller. Kontrollerer at navneoppslaget (`ilike`) ikke gir kollisjon mellom egen og global modell; ved treff i begge prioriteres selskapets egen modell.
- i18n: nye nøkler under `resourceDialogs.droneDetail.*` i `no.json` og `en.json`.
- Validering: `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
