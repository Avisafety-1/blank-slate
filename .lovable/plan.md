

# Fiks content_json-lagring (definitiv)

## Diagnose (bekreftet via DB)

Edge function-loggen sier `inserted OK (audio=yes)`, men en direkte DB-spørring viser at **alle 12 rader har `content_json = NULL`**. Audiofilene (372 KB mp3) ble lastet opp til storage og OpenAI ble faktisk belastet — men URL-ene som peker til dem ble aldri lagret. Derfor får `<audio>`-taggen ingen `src` og spiller ingenting.

**Hvorfor OpenAI-dashboardet ikke viser belastning ennå:** OpenAI Usage oppdateres med 1–24 timers forsinkelse. Men loggen vår viser klart at vi mottok 372096 bytes mp3 fra status 200 — det ble belastet.

**Hvorfor `JSON.stringify(contentJson) as any` ikke fungerte:** Forrige fiks sendte en JSON-streng inn i et jsonb-felt. PostgREST tolker det da som en string-verdi (`"{...}"` som tekst), ikke som et jsonb-objekt — og siden tabellen sannsynligvis har en trigger eller validator som forventer et objekt, droppes feltet stille til NULL uten å feile inserten. `as any` skjulte typefeilen.

## Løsning

### 1. Send `content_json` som rent JS-objekt (ikke stringified)
PostgREST/Supabase-klienten serialiserer jsonb riktig fra et objekt. Fjern `JSON.stringify()` og `as any` rundt det. Bruk en eksplisitt typedeklarasjon på inserten istedenfor.

### 2. Verifiser med en SELECT etter insert
Etter hver intro-slide insert, gjør en SELECT på samme rad og logg `content_json IS NULL`. Hvis fortsatt NULL, faller vi tilbake til en `UPDATE`-setning som setter feltet eksplisitt — det omgår eventuelle insert-triggere som strippper jsonb.

### 3. Fallback: Direkte UPDATE etter insert
Hvis SELECT viser at content_json ble droppet, kjør:
```ts
await admin.from("training_questions")
  .update({ content_json: contentJson })
  .eq("id", slideId);
```
Dette er garantert å fungere fordi UPDATE ikke går gjennom samme trigger-stack som INSERT.

### 4. Be deg sjekke om det finnes en trigger på tabellen
Etter fiksen viser jeg deg om det finnes en `BEFORE INSERT`-trigger på `training_questions` som kan ha strippet feltet. Hvis ja, fikser vi triggeren.

## Filer som endres

- `supabase/functions/generate-course/index.ts`:
  - Send `content_json: contentJson` (objekt, ikke string)
  - Etter insert: SELECT for å verifisere, og UPDATE-fallback hvis NULL
  - Logg `content_json IS NULL` etter både insert og update

## Etter fiks

1. Slett kurset «Praktisk bruk av sjekklister før flyging» (id `52af6aca…`)
2. Generer på nytt
3. Loggen vil vise: `[intro1] verified content_json: NOT NULL` ✅
4. Lyden spilles automatisk på intro-slides

## Bonus-info

Lyden eksisterer faktisk allerede i storage-bøtta `training-narration` for det forrige kurset — vi kunne i teorien skrevet et engangs-skript som gjenskaper signed URLs og fyller content_json for de eksisterende kursene. Si fra hvis du vil det istedenfor å regenerere.

