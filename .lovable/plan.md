

# Re-deploy `generate-course` og bekreft fiks

## Diagnose

Koden i `supabase/functions/generate-course/index.ts` er **allerede korrekt** (linjene 444–487 inneholder den fiksen vi ble enige om: rå objekt + verify-SELECT + UPDATE-fallback). Men edge-funksjon-loggen for det nyeste kursforsøket (`a635a0a6…` kjørt 18:32) viser fortsatt det **gamle** loggformatet: `[intro1] inserted OK (audio=yes, image=no)` — ikke det nye `[intro1] verified content_json: …`.

Det betyr at den siste filendringen aldri ble deployed til Supabase Edge Runtime. Funksjonen kjører fortsatt gammel kode som verken verifiserer eller har UPDATE-fallback. Derfor er `content_json` fortsatt NULL i alle 13 rader, og lyden spilles ikke.

## Løsning

### 1. Tving re-deploy av `generate-course`
Bruk `supabase--deploy_edge_functions` med `["generate-course"]` for å pushe den faktiske filen. Etter deploy bekreftes ny versjon ved å se etter `verified content_json:` i loggen.

### 2. Test umiddelbart
Slett kurset «Operasjonelle Begrensninger…» (`a635a0a6…`) og generer et nytt for å bekrefte at `content_json` nå lagres med `narration_audio_url`.

### 3. Hvis fiksen fortsatt ikke fungerer (insert dropper feltet stille)
Da er det noe rart med PostgREST/jsonb-håndteringen i denne spesifikke Deno-versjonen. Plan B blir å **droppe content_json fra insert helt** og kjøre en separat `UPDATE`-setning rett etter — UPDATE har en helt annen kodepath og er garantert å fungere. Logikken finnes allerede som fallback (linje 471–487), så vi kan bare snu den til primærløsning.

### 4. Bonus: fyll inn data for de 3 eksisterende kursene
MP3-filene ligger allerede i storage-bøtta `training-narration`. Kjør et engangs-SQL-skript som finner mp3-filene per slide og setter `content_json` med signert URL. Da slipper du å regenerere noen av kursene.

## Filer / handlinger

- **Re-deploy**: `supabase/functions/generate-course/index.ts` (ingen kodeendring nødvendig — bare push)
- **Verifiser via logg**: lete etter `verified content_json: NOT NULL` etter ny generering
- **Plan B (kun om nødvendig)**: Endre intro-slide-inserten til alltid å gjøre INSERT (uten content_json) → SELECT → UPDATE, slik at vi unngår jsonb-droppingen helt. Samme mønster på spørsmål-slides hvis de viser samme problem.
- **Engangs reparasjon (valgfritt)**: SQL som lister mp3-filer fra `training-narration`-bøtta og oppdaterer eksisterende kurs sine slides — så «Operasjonelle Begrensninger», «Praktisk bruk av sjekklister» og «Kurs for dronepiloter hos K2 Security» får tilbake lyd uten regenerering.

## Hva du gjør etter godkjenning

1. Jeg deployer funksjonen på nytt
2. Du sletter ett av de eksisterende kursene og genererer det på nytt
3. Vi sjekker loggen sammen — `verified content_json: NOT NULL ✓` = ferdig
4. Hvis du vil, kjører vi engangs-skriptet for å redde de tre eksisterende kursene

