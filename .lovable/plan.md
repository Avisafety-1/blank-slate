

## Skumringstid (Civil Twilight) som SORA hardstop

### Hva bygges
En ny toggle i SORA Admin-konfigurasjonen: **«Krev sivil skumring»**. Når aktivert, vil AI-risikovurderingen gi HARD STOP dersom et oppdrag er planlagt utenfor civil twilight-perioden (før morgen-skumring starter eller etter kveldsskumring slutter).

Skumringstidene beregnes **lokalt i koden** med en standard solposisjonsformel — ingen ekstern API nødvendig. Civil twilight er definert som perioden der solen er mellom 0° og -6° under horisonten, noe som kan beregnes nøyaktig fra dato og koordinater.

### Tekniske endringer

**1. Ny utility: `src/lib/civilTwilight.ts`**
- Ren matematisk beregning av solens posisjon basert på dato, breddegrad og lengdegrad
- Eksporterer funksjon `getCivilTwilightTimes(date, lat, lng)` som returnerer `{ dawn: Date, dusk: Date }`
- Bruker standard astronomisk formel (solens deklinasjon, timevinkel ved -6°)
- Ingen eksterne avhengigheter

**2. Database: Ny kolonne på `company_sora_config`**
- `require_civil_twilight boolean DEFAULT false`
- Migrasjon som legger til kolonnen

**3. Frontend: `CompanySoraConfigSection.tsx`**
- Legg til `require_civil_twilight` i `SoraConfig`-interfacet og `DEFAULT_CONFIG`
- Ny toggle ved siden av «Tillat nattflyging»-seksjonen med ikon (Sunrise/Sunset)
- Beskrivelse: «Krev at oppdrag gjennomføres innenfor sivil skumring. HARD STOP hvis utenfor.»
- Les/skriv til databasen som de øvrige feltene

**4. AI-risikovurdering: `supabase/functions/ai-risk-assessment/index.ts`**
- Les `require_civil_twilight` fra SORA-config
- Beregn civil twilight for oppdragets dato og koordinater (kopier formelen inn i Edge Function)
- Legg til i AI-prompten: «SIVIL SKUMRING: Selskapet krever at flyging skjer innenfor civil twilight (dawn–dusk). Oppdrag planlagt utenfor disse tidene er HARD STOP.»
- Inkluder beregnede tider i konteksten slik at AI-en kan vurdere mot oppdragets planlagte tidspunkt

**5. Supabase types oppdatering**
- Oppdater `src/integrations/supabase/types.ts` med den nye kolonnen

### Logikk for skumringsberegning
Civil twilight beregnes med NOAA-formelen:
1. Beregn solens deklinasjon fra dag-nummer i året
2. Beregn timevinkelen når solen er ved -6° (civil twilight-grensen)
3. Konverter til UTC-tid basert på lengdegrad
4. Juster for tidssone

Dette gir nøyaktige tider for alle lokasjoner i Norge (og globalt) uten eksterne API-kall.

