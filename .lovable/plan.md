

# Fiks talegenerering i AI-kurs

To problemer ble funnet ved sjekk av databasen og edge-funksjonen:

## Diagnose

**1. Lovable AI Gateway støtter ikke tekst-til-tale.** Dokumentasjonen lister kun chat- og bilde-modeller (Gemini, GPT-5). Endepunktet `/v1/audio/speech` med `openai/tts-1` finnes ikke der, så `generateTTS()` returnerer `null` hver gang og ingen mp3 lagres.

**2. `content_json` er NULL på alle slides** i kurset «Praktisk bruk av sjekklister før flyging». Det betyr at heller ikke `narration_text`, `heading`, `source_reference` eller `explanation` ble lagret. Derfor får TakeCourseDialog hverken lyd-URL ELLER tekst — så fallback-knappen «Les opp» (Web Speech API) vises ikke heller. Bilder ble lagret OK, så insert-kallet kjører — men jsonb-payloaden droppes. Sannsynlig årsak: `as any`-cast rundt hele insert-objektet i kombinasjon med hvordan Supabase-klienten i Deno serialiserer nested objekter med null-felter.

## Løsning

### A. Server-side TTS via OpenAI direkte
Siden Lovable AI Gateway ikke har TTS, kaller edge-funksjonen `https://api.openai.com/v1/audio/speech` direkte med modell `tts-1` og stemmen `nova` (god norsk uttale). Dette krever en ny secret: **`OPENAI_API_KEY`**. Du blir bedt om å legge den inn når implementasjonen starter.

### B. Klient-side fallback (Web Speech API)
Hvis OpenAI-nøkkel mangler ELLER TTS-kallet feiler, hopper edge-funksjonen elegant over lyd-generering. TakeCourseDialog viser da en stor «▶ Spill av tale»-knapp som bruker nettleserens innebygde `SpeechSynthesisUtterance` med `lang="nb-NO"`. Stemmen er gratis, fungerer offline, og er svært god på Apple-enheter.

### C. Fiks `content_json`-lagringen
Fjern `as any` rundt hele insert-objektet. I stedet bygger vi payloaden eksplisitt typet og sender `content_json` som et rent JS-objekt (Supabase-klienten serialiserer jsonb selv). Dette gjelder både intro-slides og spørsmål-slides. Etter fiks vil `narration_text`, `heading`, `source_reference` og `explanation` faktisk havne i databasen.

### D. Forbedret feilrapportering
Logg eksplisitt om TTS-kallet feilet (status + body) og om insertet returnerte feil. I dag svelges feil i `console.error` men kommer ikke fram til brukeren. Vi legger til en `warnings`-array i responsen slik at UI kan vise «Lyd ble ikke generert — bruk Les opp-knappen i stedet».

### E. Auto-spill ved bytte til intro-slide
For å unngå at brukeren må trykke på Web Speech-knappen, kobler vi `speechSynthesis.speak()` på samme bruker-gesture som «Neste»-knappen som tok dem TIL sliden. Det respekterer nettleserens autoplay-policy. (For server-genererte mp3 fortsetter `<audio autoPlay>` å virke som i dag.)

## Eksisterende kurs

Kurset `d4d3f5ca…` er ubrukelig (ingen tekst, ingen lyd). Etter fiks må du slette og generere det på nytt — da får du både bilder, lest tale (eller fallback-knapp) og fungerende spørsmål med forklaringer.

## Filer som endres

- `supabase/functions/generate-course/index.ts` — bytt TTS-implementasjonen til OpenAI direkte, eksplisitt typing av insert-payload (fjern `as any`), warnings-array i respons
- `src/components/training/TakeCourseDialog.tsx` — auto-spill via Web Speech på user-gesture når lyd-URL mangler men narration_text finnes
- `src/components/training/AICourseGeneratorDialog.tsx` — vis warnings fra generate-course-responsen som toast (f.eks. «3 av 3 lydfiler kunne ikke genereres — fallback til nettleser-tale»)

## Hva du må gjøre

Etter at du godkjenner planen ber jeg deg legge til **`OPENAI_API_KEY`** som secret. Du finner nøkkelen på platform.openai.com under API Keys. Hvis du IKKE vil bruke OpenAI, si fra — da dropper vi server-side TTS helt og bruker bare Web Speech API (gratis, men varierende stemmekvalitet per OS).

