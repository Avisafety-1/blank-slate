# "Vurder med AI" på totalvurderingen

En knapp i totalvurderings-boksen nederst i evalueringsskjemaet som lager et kort, strukturert sammendrag av hele evalueringen – basert kun på karakterene (1–6) og kommentarene som allerede er fylt ut i skjemaet.

## Slik oppleves det

- I boksen "Totalvurdering" kommer det en knapp `Vurder med AI` (sparkle-ikon) ved siden av snitt-badgen.
- Under knappen står en kort forklarende tekst: AI-en bruker kun karakterene og kommentarene du har skrevet i skjemaet, og finner ikke på informasjon. Forslaget kan redigeres fritt før lagring.
- Knappen er deaktivert til minst én karakter er satt (tooltip forklarer hvorfor), og mens skjemaet er låst (fullført).
- Ved klikk: knappen viser spinner ("Analyserer …"). Resultatet settes inn i tekstfeltet.
- Hvis feltet allerede har tekst, spør en liten bekreftelsesdialog om teksten skal erstattes eller om AI-teksten skal legges til under.
- Feil (rate limit 429 / tomme kreditter 402 / annet) vises som tydelig toast, og eksisterende tekst røres ikke.

Ingen tvungen lagring av utkast først: skjemaets nåværende innhold (også ulagrede endringer) sendes direkte til analysen, så AI-en alltid ser det brukeren faktisk ser.

## Innholdet i AI-teksten

Kort og strukturert, på brukerens språk (no/en), typisk 120–200 ord:

1. Én oppsummerende setning med totalsnitt og helhetsinntrykk.
2. `Styrker` – 2–4 punkter, hver forankret i en konkret underkategori med karakter.
3. `Forbedringsområder` – 2–4 punkter, samme forankring.
4. `Anbefalt oppfølging` – 1–3 konkrete tiltak avledet av det som står i skjemaet.

Regler i systemprompten: bruk kun mottatt data, ingen antakelser om hendelser som ikke er nevnt, ingen persondata utover fornavn/rolle som allerede er i skjemaet, ikke gjenta hele kommentarer ordrett, marker eksplisitt hvis kategori mangler karakter i stedet for å gjette.

## Teknisk

**Ny edge function `evaluate-summary-ai`** (`supabase/functions/evaluate-summary-ai/index.ts` + `prompts.ts`), etter samme mønster som `company-status-ai`:
- CORS-håndtering, `Authorization`-sjekk (Bearer), `LOVABLE_API_KEY` fra env.
- Body: `{ templateTitle, language, categories: [{ name, average, subcategories: [{ name, score, comment }] }], overallAverage }`. Kun karakterer og kommentarer sendes – ingen navn, e-post eller oppdrags-ID.
- Kall til Lovable AI Gateway Responses API (`https://ai.gateway.lovable.dev/v1/responses`) med modell `openai/gpt-5.6-sol`, `stream: true`, SSE leses server-side og `response.output_text.delta` akkumuleres til én tekst som returneres som `{ summary }`.
- 429/402 propageres med samme statuskode og lesbar melding.

**Frontend**
- `src/components/evaluation/EvaluationFormPreview.tsx`: nytt valgfritt prop `overallAiSlot?: React.ReactNode` som rendres i totalvurderings-kortet (over textarea), slik at designer-forhåndsvisningen forblir uendret.
- Ny komponent `src/components/evaluation/EvaluationAiSummaryButton.tsx`: knapp + forklaringstekst + erstatt/legg-til-bekreftelse, kaller `supabase.functions.invoke("evaluate-summary-ai", …)`, returnerer tekst via `onGenerated`.
- `src/components/evaluation/EvaluationResponseDialog.tsx`: bygger payload fra `template.categories`, `scores` og `comments`, sender `overallAiSlot` inn i previewen og setter `setOverallComment(...)` på resultat. Skjules når `locked`.
- i18n-nøkler under `evaluation.ai.*` (knapp, hjelpetekst, laster, erstatt/legg til, feilmeldinger) i både `no.json` og `en.json`.
